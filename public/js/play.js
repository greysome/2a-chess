$(document).ready(() => {
    // Rendering
    var canvas = document.getElementById('canvas'),
	ctx = canvas.getContext('2d');
    var cur_highlight_square = null;

    // Game state
    var player_id; // -1 if spectator
    var is_my_turn = false;
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

    socket.on('broadcast player turn', (_player_id, username, _legal_moves) => {
	/* start game, either spectate or play */
	if (player_id == _player_id) {
	    $('#txt_gamestate').text('Your turn');
	    is_my_turn = true;
	    legal_moves = _legal_moves;
	}
	else {
	    $('#txt_gamestate').text(username + '\'s turn');
	    is_my_turn = false;
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

    canvas.addEventListener('click', event => {
	if (!is_my_turn)
	    return;

	var rect = canvas.getBoundingClientRect();
	var x = event.clientX - rect.left;
	var y = event.clientY - rect.top;

	// get displacement from bottom square
	var coords = render.get_square_coord(0, 0, 0);
	var displacement = [x - coords[0], y - coords[1]];

	// project onto vectors representing movement by one file/rank
	var lrank = Math.round(utility.component(displacement, [-render.square_size, -render.square_size]));
	var lfile = Math.round(utility.component(displacement, [render.square_size, -render.square_size]));

	var grank, gfile;
	[grank, gfile] = utility.local_to_global_coords(player_id, lrank, lfile);

	if (grank < 0 || grank >= 8 || gfile < 0 || gfile >= 8)
	    return; // clicked outside of board

	if (cur_highlight_square == null && board[grank][gfile] == '')
	    return; // no piece to highlight

	if (cur_highlight_square == null) {
	    render.highlight_square(ctx, player_id, board, grank, gfile);
	    cur_highlight_square = [grank, gfile];

	    legal_moves.forEach((move) => {
		var old_grank, old_gfile, new_grank, new_gfile;
		[old_grank, old_gfile, new_grank, new_gfile] = move;
		if (grank == old_grank && gfile == old_gfile)
		    render.draw_move_indicator(ctx, player_id, new_grank, new_gfile);
	    });
	}
	else {
	    var old_grank = cur_highlight_square[0], old_gfile = cur_highlight_square[1];
	    if (grank == old_grank && gfile == old_gfile) {
		// clear all highlights and legal move indicators
		render.draw_board(ctx, player_id, board);
		cur_highlight_square = null;
	    }
	    else if (utility.array_includes(legal_moves, [old_grank, old_gfile, grank, gfile])) {
		socket.emit('player move', room_id, player_id, old_grank, old_gfile, grank, gfile);
		render.draw_board(ctx, player_id, board);
		cur_highlight_square = null;
	    }
	}
    });
});
