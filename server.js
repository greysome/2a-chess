const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const io = require('socket.io')(server);
const path = require('path');

var room_ids = [];
var games = Object(); // {id: state}
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

// Generating legal moves
function transform(player_id, rank, file) {
    var centered_rank = rank-3.5, centered_file = file-3.5;
    for (var i = 0; i < player_id; i++) {
	var tmp = centered_rank;
	centered_rank = centered_file;
	centered_file = -tmp;
    }
    return [centered_rank+3.5, centered_file+3.5];
}

function inv_transform(player_id, rank, file) {
    return transform(4-player_id, rank, file);
}

/*
  return array of [rank, file], where the piece at (rank, file) can
  be moved by player
*/
function movable_pieces(player_id, board) {
    var color = player_id % 2;
    var squares = [];

    /*
      for first players, iterate through array of [rank, file] where rank+file <= 8.
      for other players, iterate through array of [rank, file] which
      is rotated by a multiple of 90 degrees.
    */
    for (var rank = 0; rank < 8; rank++) {
	for (var file = 0; file < 8-rank; file++) {
	    var inv_coords = inv_transform(player_id, rank, file);
	    var _rank = inv_coords[0], _file = inv_coords[1];
	    var piece = board[_rank][_file];

	    // square is empty
	    if (piece == '')
		continue;

	    // piece is of the wrong color
	    if ((color == 0 && piece.charAt(0) == 'b') ||
		(color == 1 && piece.charAt(0) == 'w'))
		continue;

	    squares.push([_rank, _file]);
	}
    }

    return squares;
}

/*
  return array of legal moves [old_rank, old_file, new_rank, new_file]
  along the ray (rank + i*d_rank, rank + i*d_file), where
  1 <= i <= max_length
*/
function ray_moves(board, rank, file, d_rank, d_file, max_length) {
    var piece = board[rank][file];
    var color = piece.charAt(0);
    var new_square;
    var moves = [];

    for (var i = 1; i <= max_length; i++) {
	var new_rank = rank + i*d_rank, new_file = file + i*d_file;
	if (new_rank < 0 || new_rank >= 8 || new_file < 0 || new_file >= 8) {
	    break;
	}

	var new_piece = board[new_rank][new_file];
	if (new_piece == '') {
	    // empty square
	    moves.push([rank, file, new_rank, new_file]);
	    continue;
	}
	else if (piece.charAt(0) == new_piece.charAt(0)) {
	    // blocked by same color piece
	    break;
	}
	else if (piece.charAt(0) != new_piece.charAt(0)) {
	    moves.push([rank, file, new_rank, new_file]);
	    break;
	}
    }

    return moves;
}

/*
  like `ray_moves()`, but checks legal moves along multiple
  rays. `d_rankfiles` is an array of [d_rank, d_file] and
  `max_lengths` is an array of max_length.
*/
function multiple_ray_moves(board, rank, file, d_rankfiles, max_lengths) {
    var moves = [];
    for (var i = 0; i < d_rankfiles.length; i++) {
	var d_rank = d_rankfiles[i][0],
	    d_file = d_rankfiles[i][1];
	var max_length = max_lengths[i];
	moves = moves.concat(ray_moves(board, rank, file, d_rank, d_file, max_length));
    }
    return moves;
}

/*
  return array of [old_rank, old_file, new_rank, new_file], where
  piece at (old_rank, old_file) can be moved to (new_rank, new_file)
*/
function legal_moves(player_id, board) {
    var moves = [];
    movable_pieces(player_id, board).forEach((coords) => {
	var rank = coords[0], file = coords[1];
	var piece = board[rank][file];
	var color = piece.charAt(0), type = piece.charAt(1);

	if (type == 'p') {
	    // TODO: change
	    moves = moves.concat(
		multiple_ray_moves(board, rank, file,
				   [[1,0],[0,1],[-1,0],[0,-1],
				    [1,1],[-1,1],[1,-1],[-1,-1]],
				   [1,1,1,1,1,1,1,1])
	    );
	}
	else if (type == 'n') {
	    moves = moves.concat(
		multiple_ray_moves(board, rank, file,
				   [[1,2],[-1,2],[1,-2],[-1,-2],
				    [2,1],[-2,1],[2,-1],[-2,-1]],
				   [1,1,1,1,1,1,1,1])
	    );
	}
	else if (type == 'b') {
	    moves = moves.concat(
		multiple_ray_moves(board, rank, file,
				   [[1,1],[-1,1],[1,-1],[-1,-1]],
				   [7,7,7,7])
	    );
	}
	else if (type == 'r') {
	    moves = moves.concat(
		multiple_ray_moves(board, rank, file,
				   [[1,0],[0,1],[-1,0],[0,-1]],
				   [7,7,7,7])
	    );
	}
	else if (type == 'k') {
	    moves = moves.concat(
		multiple_ray_moves(board, rank, file,
				   [[1,0],[0,1],[-1,0],[0,-1],
				    [1,1],[-1,1],[1,-1],[-1,-1]],
				   [1,1,1,1,1,1,1,1])
	    );
	}
    });

    return moves;
}

function any_kings_left(board, color) {
    // 0 = white, 1 = black
    if (color == 0)
	return board.flat().includes('wk');
    else if (color == 1)
	return board.flat().includes('bk');
}

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
    console.log(room_id, player_id, secs_left);
    if (games[room_id].connection_states[player_id]) {
	return;
    }

    if (secs_left == 0) {
	io.to(room_id).emit('broadcast stop game');
	delete games[room_id];
	return;
    }

    io.to(room_id).emit('broadcast wait for player to reconnect',
			game.usernames[player_id],
			secs_left);
    setTimeout(wait_for, 1000, room_id, player_id, secs_left-1);
}

// socket.io
io.on('connection', (socket) => {
    console.log('connect', socket.id);

    socket.on('join room', (room_id, username) => {
	if (!room_ids.includes(room_id)) {
	    socket.emit('room not created');
	}
	else {
	    var game = games[room_id];
	    socket.join(room_id); // join socket.io room
	    if (game.num_players >= 4) {
		sockets[socket.id] = {room_id: room_id,
				      player_id: -1,
				      username: username};
		games[room_id].num_spectators++;

		// room already has enough players; join as spectators
		socket.emit('joined room spectator', games[room_id].board);
		var ret = connected_and_disconnected(room_id);
		io.to(room_id).emit('broadcast members update',
				    ret[0], ret[1],
				    game.num_spectators);
	    }
	    else {
		// join the room as a player
		player_id = games[room_id].num_players++;
		sockets[socket.id] = {room_id: room_id,
				      player_id: player_id,
				      username: username};
		games[room_id].usernames.push(username);
		games[room_id].connection_states.push(true);
		socket.emit('joined room player',
			    player_id,
			    username,
			    game.board);

		ret = connected_and_disconnected(room_id);
		io.to(room_id).emit('broadcast members update',
				    ret[0], ret[1],
				    game.num_spectators);

		// room has enough players; start game
		if (game.num_players == 4) {
		    io.to(room_id).emit('broadcast player turn',
					0,
					game.usernames[game.cur_player],
					legal_moves(game.cur_player, game.board));
		}
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
				legal_moves(game.cur_player, game.board));
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
	if (!any_kings_left(game.board, 0)) {
	    io.to(room_id).emit('broadcast black win');
	    delete games[room_id];
	    return;
	}
	else if (!any_kings_left(game.board, 1)) {
	    io.to(room_id).emit('broadcast white win');
	    delete games[room_id];
	    return;
	}

	// move on to next player
	var cur_player = player_id;
	while (true) {
	    cur_player = (cur_player+1) % 4;
	    // find the next player who is not in stalemate
	    var moves = legal_moves(cur_player, game.board);
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
	// player with that socket connection hasn't joined room yet
	if (!(socket.id in sockets))
	    return;

	var room_id = sockets[socket.id].room_id,
	    player_id = sockets[socket.id].player_id,
	    username = sockets[socket.id].username;
	var game = games[room_id];
	delete sockets[socket.id];

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

	    if (all_disconnected)
		delete games[room_id];
	}

	console.log('disconnect', room_id, player_id, username, game.connection_states);
    });
});

// server setup
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

function randint(min, max) {
    return Math.round(Math.random()*(max-min) + min);
}

app.get('/create_room', (req, res) => {
    var room_id;
    while (true) {
	room_id = randint(100, 1000).toString();
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
