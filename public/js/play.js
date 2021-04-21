$(document).ready(() => {
    // Rendering
    var canvas = document.getElementById('canvas'),
	ctx = canvas.getContext("2d");
    var canvas_size = 900;
    var square_size = canvas_size/16;

    var light_col = '#F0D9B5', dark_col = '#BF804D',
	highlight_col = '#DDDDDD', move_indicator_col = '#41b075';
    var cur_highlight = null; // currently highlighted square

    // Game state
    var piece_images = new Object(); // to be loaded dynamically
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
	load_piece_images(() => { draw_board(player_id, board); });
    });

    socket.on('joined room player', (_player_id, _username, _board) => {
	username = _username;
	player_id = _player_id;
	board = _board;

	$('#txt_room_id').text('Room ID: ' + room_id);
	$('#txt_player').text('You are ' + username + ' with id ' + player_id);
	load_piece_images(() => { draw_board(player_id, board); });

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
	draw_board(player_id, new_board);
    });

    socket.on('broadcast wait for player to reconnect', (username, secs_left) => {
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

    /*
    a version of `Array.includes()` that works when the parameter is an
    array
    */
    function array_includes(src, array) {
	for (var i = 0; i < src.length; i++) {
	    var a = src[i];

	    if (array.length != a.length)
		continue;

	    var arrays_eq = true;
	    for (var j = 0; j < a.length; j++)
		if (array[j] != a[j])
		    arrays_eq = false;

	    if (arrays_eq)
		return true;
	}

	return false;
    }

    canvas.addEventListener('click', event => {
	if (!is_my_turn)
	    return;

	var rect = canvas.getBoundingClientRect();
	var x = event.clientX - rect.left;
	var y = event.clientY - rect.top;

	// get displacement from bottom square
	var coords = get_square_coord(0, 0, 0);
	var displacement = [x - coords[0], y - coords[1]];

	// project onto vectors representing movement by one file/rank
	var rank = Math.round(component(displacement, [-square_size, -square_size]));
	var file = Math.round(component(displacement, [square_size, -square_size]));

	/* get actual rank/file of piece on board, based on the rank/file
	* selected on the board from the player's perspective */
	var coords = inv_transform(player_id, rank, file);
	rank = coords[0];
	file = coords[1];

	if (rank < 0 || rank >= 8 || file < 0 || file >= 8)
	    return; // clicked outside of board

	if (cur_highlight == null && board[rank][file] == '')
	    return; // no piece to highlight

	if (cur_highlight == null) {
	    highlight_square(player_id, rank, file);
	    cur_highlight = [rank, file];

	    legal_moves.forEach((move) => {
		var old_rank = move[0], old_file = move[1],
		    new_rank = move[2], new_file = move[3];
		if (rank == old_rank && file == old_file)
		    draw_move_indicator(player_id, new_rank, new_file);
	    });
	}
	else {
	    var old_rank = cur_highlight[0], old_file = cur_highlight[1];
	    console.log(old_rank, old_file, rank, file);
	    if (rank == old_rank && file == old_file) {
		// clear all highlights and legal move indicators
		draw_board(player_id, board);
		cur_highlight = null;
	    }
	    else if (array_includes(legal_moves, [old_rank, old_file, rank, file])) {
		socket.emit('player move', room_id, player_id, old_rank, old_file, rank, file);
		draw_board(player_id, board);
		cur_highlight = null;
	    }
	}
    });

    /*
    given an orthogonal basis {w1, ..., wn}, `component(v, wi)`
    returns the component of v wrt wi
    */
    function component(v, w) {
	return (v[0]*w[0] + v[1]*w[1]) / (w[0]**2 + w[1]**2);
    }

    /*
    given the actual rank/file of the piece in the board, return the
    rank/file used to render the piece on the canvas, based on the
    player's perspective
    */
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
    in the following functions, the actual rank/file of the piece is
    passed in, rather than the rank/file used for rendering
    */
    function get_square_coord(player_id, rank, file) {
	var coords = transform(player_id, rank, file);
	rank = coords[0];
	file = coords[1];

	var x = canvas_size/2, y = canvas_size - square_size;
	x -= rank * square_size; y -= rank * square_size;
	x += file * square_size; y -= file * square_size;
	return [x, y];
    }

    function get_square_color(rank, file) {
	var color;
	if (rank % 2 == 0)
	    color = (file % 2 == 0 ? light_col : dark_col);
	else
	    color = (file % 2 == 0 ? dark_col : light_col);
	return color;
    }

    function draw_square(player_id, rank, file, color) {
	var coords = get_square_coord(player_id, rank, file);
	var x = coords[0], y = coords[1];

	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(x-square_size, y);
	ctx.lineTo(x, y-square_size);
	ctx.lineTo(x+square_size, y);
	ctx.lineTo(x, y+square_size);
	ctx.lineTo(x-square_size, y);
	ctx.closePath();
	ctx.fill();
    }

    function draw_move_indicator(player_id, rank, file) {
	var coords = get_square_coord(player_id, rank, file);
	var x = coords[0], y = coords[1];

	ctx.fillStyle = move_indicator_col;
	ctx.beginPath();
	ctx.arc(x, y, 10, 0, 2 * Math.PI);
	ctx.fill();
    }

    function draw_piece(player_id, rank, file, piece) {
	var offset_x = -30, offset_y = -34; // found manually, to make piece positioning look good
	var coords = get_square_coord(player_id, rank, file);

	if (piece != '')
	    ctx.drawImage(piece_images[piece],
			coords[0]+offset_x, coords[1]+offset_y,
			1.1*square_size, 1.1*square_size);
    }

    function draw_board(player_id, board) {
	for (var rank = 0; rank <= 7; rank++) {
	    for (var file = 0; file <= 7; file++) {
		var piece = board[rank][file];
		draw_square(player_id, rank, file, get_square_color(rank, file));
		draw_piece(player_id, rank, file, piece);
	    }
	}
    }

    function highlight_square(player_id, rank, file) {
	draw_square(player_id, rank, file, highlight_col);
	var piece = board[rank][file];
	if (piece != '')
	    draw_piece(player_id, rank, file, piece);
    }

    function unhighlight_square(player_id, rank, file) {
	draw_square(player_id, rank, file, get_square_color(rank, file));
	var piece = board[rank][file];
	if (piece != '')
	    draw_piece(player_id, rank, file, piece);
    }

    function load_piece_image(piece) {
	return new Promise((resolve, reject) => {
	    var img = new Image();
	    img.onload = () => resolve([img, piece]);
	    img.src = '../images/' + piece + '.svg';
	});
    }

    function load_piece_images(after) {
	var pieces = ['wp', 'wr', 'wn', 'wb', 'wq', 'wk',
		    'bp', 'br', 'bn', 'bb', 'bq', 'bk']
	Promise.all(pieces.map(load_piece_image)).then(datas => {
	    // store images
	    datas.forEach((data, idx) => {
		var img = data[0], piece = data[1];
		piece_images[piece] = img;
	    });

	    after();
	});
    }
});
