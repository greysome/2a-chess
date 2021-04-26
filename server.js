const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);
const path = require('path');
const utility = require('./public/js/utility');
const engine = require('./public/js/engine');

var room_ids = [];
var games = Object(); // {game id: state}
var start_board = [
    ['wr', 'wn', 'wp', '', '', 'bp', 'bk', 'br'],
    ['wb', 'wk', 'wp', '', '', 'bp', 'bb', 'bn'],
    ['wp', 'wp', '', '', '', '', 'bp', 'bp'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['bp', 'bp', '', '', '', '', 'wp', 'wp'],
    ['bb', 'bk', 'bp', '', '', 'wp', 'wb', 'wn'],
    ['br', 'bn', 'bp', '', '', 'wp', 'wk', 'wr']
];
var sockets = Object(); // {socket id: {room_id: _, player_id: _, username: _}}}

function connected_and_disconnected(room_id) {
    var connected = [], disconnected = [];
    var game = games[room_id];
    for (var i = 0; i < game.num_players; i++) {
	if (game.connection_states[i])
	    connected.push(game.usernames[i]);
	else
	    disconnected.push(game.usernames[i]);
    }
    return [connected, disconnected];
}

function wait_for(room_id, player_id, secs_left) {
    var game = games[room_id];
    if (games[room_id].connection_states[player_id]) {
	return;
    }

    if (secs_left == 0) {
	io.to(room_id).emit('broadcast stop game');
	remove_room(room_id);
	return;
    }

    io.to(room_id).emit('broadcast wait for player to reconnect',
			game.usernames[player_id],
			secs_left);
    setTimeout(wait_for, 1000, room_id, player_id, secs_left-1);
}

function remove_room(room_id) {
    delete games[room_id];
    var idx = room_ids.indexOf(room_id);
    room_ids.splice(idx, 1);
}

function join_as_spectator(socket, room_id, username) {
    var game = games[room_id];
    sockets[socket.id] = {room_id: room_id,
			  player_id: -1,
			  username: username};
    games[room_id].num_spectators++;

    socket.emit('joined room spectator', game.board);
    var ret = connected_and_disconnected(room_id);
    io.to(room_id).emit('broadcast members update',
			ret[0], ret[1], game.num_spectators);
}

function join_as_player(socket, room_id, username) {
    var game = games[room_id];
    player_id = games[room_id].num_players++;
    sockets[socket.id] = {room_id: room_id,
			  player_id: player_id,
			  username: username};
    games[room_id].usernames.push(username);
    games[room_id].connection_states.push(true);

    socket.emit('joined room player', player_id, username, game.board);
    var ret = connected_and_disconnected(room_id);
    io.to(room_id).emit('broadcast members update',
			ret[0], ret[1], game.num_spectators);
}

function start_game(io, room_id) {
    var game = games[room_id];
    games[room_id].cur_player = 0;
    io.to(room_id).emit('broadcast player turn',
			game.cur_player,
			game.usernames[game.cur_player],
			engine.legal_moves(game.cur_player, game.board));
}

io.on('connection', (socket) => {
    console.log('connect', socket.id);

    socket.on('join room', (room_id, username) => {
	if (!room_ids.includes(room_id)) {
	    socket.emit('room not created');
	}
	else {
	    socket.join(room_id); // join socket.io room

	    var game = games[room_id];
	    if (game.num_players >= 4)
		join_as_spectator(socket, room_id, username);
	    else {
		join_as_player(socket, room_id, username);
		if (game.num_players == 4)
		    start_game(io, room_id);
	    }
	}
    });

    socket.on('rejoin room', (room_id, player_id) => {
	var game = games[room_id];
	socket.join(room_id);

	if (player_id >= 0) {
	    // check if an existing socket already has the same
	    // room_id and player_id
	    for (var socket_id in sockets) {
		if (sockets[socket_id].room_id == room_id &&
		    sockets[socket_id].player_id == player_id) {
		    socket.emit('not rejoining');
		    console.log('not rejoining', room_id, player_id, games[room_id].connection_states, sockets);
		    return;
		}
	    }

	    sockets[socket.id] = {room_id: room_id, player_id: player_id};
	    games[room_id].connection_states[player_id] = true;
	    socket.emit('joined room player',
			player_id,
			game.usernames[player_id],
			game.board);
	    var ret = connected_and_disconnected(room_id);
	    io.to(room_id).emit('broadcast members update',
				ret[0], ret[1],
				game.num_spectators);
	    io.to(room_id).emit('broadcast player turn',
				game.cur_player,
				game.usernames[game.cur_player],
				engine.legal_moves(game.cur_player, game.board));
	}
	else
	    socket.emit('joined room spectator', game.board);
	console.log('rejoining', room_id, player_id, game.connection_states, sockets);
    });

    socket.on('player move', (room_id, player_id, old_rank, old_file, new_rank, new_file) => {
	var game = games[room_id];

	// it is not that player's turn
	if (player_id != games[room_id].cur_player)
	    return;

	var piece = game.board[old_rank][old_file];
	games[room_id].board[old_rank][old_file] = '';
	games[room_id].board[new_rank][new_file] = piece;
	io.to(room_id).emit('broadcast player move', game.board);

	// check win condition
	if (engine.lost_yet(game.board, 0)) {
	    io.to(room_id).emit('broadcast black win');
	    remove_room(room_id);
	    return;
	}
	else if (engine.lost_yet(game.board, 1)) {
	    io.to(room_id).emit('broadcast white win');
	    remove_room(room_id);
	    return;
	}

	// move on to next player
	var cur_player = player_id;
	while (true) {
	    cur_player = (cur_player+1) % 4;
	    // find the next player who is not in stalemate
	    var moves = engine.legal_moves(cur_player, game.board);
	    if (moves.length != 0) {
		io.to(room_id).emit('broadcast player turn',
				    cur_player,
				    game.usernames[cur_player],
				    moves);
		games[room_id].cur_player = cur_player;

		if (!game.connection_states[cur_player]) {
		    wait_for(room_id, cur_player, 30);
		}
		break;
	    }
	}
    });

    socket.on('disconnect', () => {
	// player with that socket connection is not in room
	if (!(socket.id in sockets))
	    return;

	var room_id = sockets[socket.id].room_id,
	    player_id = sockets[socket.id].player_id,
	    username = sockets[socket.id].username;
	delete sockets[socket.id];

	// room no longer exists
	if (!room_ids.includes(room_id))
	    return;

	var game = games[room_id];

	if (player_id >= 0)
	    games[room_id].connection_states[player_id] = false;
	else
	    games[room_id].num_spectators--;

	var ret = connected_and_disconnected(room_id);
	io.to(room_id).emit('broadcast members update',
			    ret[0], ret[1],
			    game.num_spectators);

	if (player_id == game.cur_player)
	    wait_for(room_id, game.cur_player, 30);
	else if (game.cur_player == -1) {
	    // delete game if all disconnected even before game starts
	    var all_disconnected = true;
	    for (var i = 0; i < game.num_players; i++)
		if (game.connection_states[i])
		    all_disconnected = false;

	    console.log('game not started', all_disconnected);

	    if (all_disconnected)
		remove_room(room_id);
	}

	console.log('disconnect', room_id, player_id, username, game.connection_states);
    });
});

// server setup
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/create_room', (req, res) => {
    var room_id;
    while (true) {
	room_id = utility.randint(100, 1000).toString();
	if (!room_ids.includes(room_id))
	    break;
    }
    room_ids.push(room_id);
    res.send(room_id);
    games[room_id] = {num_players: 0,
		      usernames: [],
		      num_spectators: 0,
		      board: start_board,
		      cur_player: -1,
		      connection_states: []};
});

app.get('/room_exists', (req, res) => {
    res.send(room_ids.includes(req.query.id));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, 'play.html'));
});

server.listen(process.env.PORT || 3000, () => {
    console.log('listening on port');
});
