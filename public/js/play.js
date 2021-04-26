$(document).ready(() => {
    // Rendering
    var canvas = document.getElementById('canvas'),
	ctx = canvas.getContext('2d');

    // Game state
    var player_id; // -1 if spectator
    var is_my_turn = false;
    var movable_pieces = [];
    var legal_moves = [];
    var board;

    // Networking
    var url_params = new URLSearchParams(window.location.search);
    var room_id = url_params.get('id');
    var username = url_params.get('username');

    var socket = io();

    console.log(document.cookie.split('; '));
    // cookie is a list of room_id=player_id pairs
    if (document.cookie.length == 0)
	// not in any room at all
	socket.emit('join room', room_id, username);
    else {
	// user is already in some room
	var entered_room = false;

	document.cookie.split(' ').forEach((s) => {
	    var key_value = s.split('=');
	    var key = key_value[0], value = key_value[1];
	    // user is in the room entered
	    if (key == room_id) {
		entered_room = true;
		room_id = key;
		player_id = parseInt(value);

		$.get('/room_exists', {id: room_id}, (exists) => {
		    if (exists) {
			alert('Rejoining room ' + room_id);
			socket.emit('rejoin room', room_id, player_id);
		    }
		    else {
			alert('Room does not exist!');
		    }
		});

		return;
	    }
	});

	// user is not in the room entered
	if (!entered_room)
	    socket.emit('join room', room_id, username);
    }

    socket.on('not rejoining', () => {
	alert('This game is already open in another tab');
    });

    socket.on('room not created', () => {
	alert('This room does not exist!');
    });

    socket.on('joined room spectator', (_board) => {
	player_id = -1;
	board = _board;
	$('#txt_player').text('You are spectating');
	render.load_piece_images(() => { render.draw_board(ctx, player_id, board); });
    });

    socket.on('joined room player', (_player_id, _username, _board) => {
	username = _username;
	player_id = _player_id;
	board = _board;

	$('#txt_room_id').text('Room ID: ' + room_id);
	$('#txt_player').text('You are ' + username + ' with id ' + player_id);
	render.load_piece_images(() => { render.draw_board(ctx, player_id, board); });

	// incredibly lazy way to save cookies
	// allows player to rejoin room after disconnecting
	document.cookie = room_id + '=' + player_id.toString();
    });

    socket.on('broadcast members update', (connected, disconnected, num_spectators) => {
	$('#txt_connected').text('Connected players: ' + connected.toString());
	$('#txt_disconnected').text('Disconnected players: ' + disconnected.toString());
	$('#txt_spectators').text(num_spectators.toString() + ' spectators');
    });

    socket.on('broadcast player turn', (_player_id, username, _movable_pieces, _legal_moves) => {
	/* start game, either spectate or play */
	if (player_id == _player_id) {
	    $('#txt_gamestate').text('Your turn');
	    is_my_turn = true;
	    movable_pieces = _movable_pieces;
	    legal_moves = _legal_moves;
	}
	else {
	    $('#txt_gamestate').text(username + '\'s turn');
	    is_my_turn = false;
	    movable_pieces = [];
	    legal_moves = [];
	}
    });

    socket.on('broadcast player move', (new_board) => {
	board = new_board;
	render.draw_board(ctx, player_id, new_board);
    });

    socket.on('broadcast wait for disconnected player', (username, secs_left) => {
	$('#txt_gamestate').text(username + ' disconnected, waiting ' + secs_left.toString() + ' more seconds');
    });

    socket.on('broadcast stop game', () => {
	$('#txt_gamestate').text('Game stopped because player disconnected.');
    });

    socket.on('broadcast white win', () => {
	$('#txt_gamestate').text('White team won!');
	is_my_turn = false;
	legal_moves = [];
    });

    socket.on('broadcast black win', () => {
	$('#txt_gamestate').text('Black team won!');
	is_my_turn = false;
	legal_moves = [];
    });

    function get_click_local_coords(event) {
	var rect = canvas.getBoundingClientRect();
	var x = event.clientX - rect.left;
	var y = event.clientY - rect.top;

	// get displacement from bottom square
	var coords = render.get_square_coord(0, 0, 0);
	var displacement = [x - coords[0], y - coords[1]];

	// project onto vectors representing movement by one file/rank
	var lrank = Math.round(utility.component(displacement, [-render.square_size, -render.square_size]));
	var lfile = Math.round(utility.component(displacement, [render.square_size, -render.square_size]));
	return [lrank, lfile];
    }

    canvas.addEventListener('click', (event) => {
	if (!is_my_turn)
	    return;

	var local_coords = get_click_local_coords(event);
	var grank, gfile;
	[grank, gfile] = utility.local_to_global_coords(player_id, local_coords[0], local_coords[1]);

	// clicked outside of board
	if (grank < 0 || grank >= 8 || gfile < 0 || gfile >= 8)
	    return;

	// highlight a piece which can be moved
	if (utility.array_includes(movable_pieces, [grank, gfile])) {
	    render.draw_board(ctx, player_id, board); // clear all existing highlights
	    render.cur_highlighting = true;
	    render.cur_highlight_square = [grank, gfile];
	    render.draw_legal_moves(ctx, player_id, board, grank, gfile, legal_moves);
	}

	// highlighted piece's destination square has been selected
	if (render.cur_highlighting) {
	    var old_grank = render.cur_highlight_square[0],
		old_gfile = render.cur_highlight_square[1];
	    console.log(room_id, player_id, old_grank, old_gfile, grank, gfile);
	    if (utility.array_includes(legal_moves, [old_grank, old_gfile, grank, gfile])) {
		socket.emit('player move', room_id, player_id, old_grank, old_gfile, grank, gfile);
		render.cur_highlighting = false;
		render.cur_highlight_square = null;
		render.draw_board(ctx, player_id, board); // clear all existing highlights
	    }
	}
    });
});
