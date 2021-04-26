((exports) => {
    exports.canvas_size = 900;
    exports.square_size = exports.canvas_size/16;

    exports.light_col = '#F0D9B5';
    exports.dark_col = '#BF804D';
    exports.highlight_col = '#DDDDDD';
    exports.move_indicator_col = '#41b075';

    exports.piece_images = new Object(); // to be loaded dynamically
    exports.cur_highlight_square = null;

    exports.get_square_coord = (player_id, grank, gfile) => {
	var lrank, lfile;
	[lrank, lfile] = utility.global_to_local_coords(player_id, grank, gfile);

	var x = exports.canvas_size/2, y = exports.canvas_size - exports.square_size;
	x -= lrank * exports.square_size; y -= lrank * exports.square_size;
	x += lfile * exports.square_size; y -= lfile * exports.square_size;
	return [x, y];
    };

    exports.get_square_color = (grank, gfile) => {
	var color;
	if (grank % 2 == 0)
	    color = (gfile % 2 == 0 ? exports.light_col : exports.dark_col);
	else
	    color = (gfile % 2 == 0 ? exports.dark_col : exports.light_col);
	return color;
    };

    exports.draw_square = (ctx, player_id, grank, gfile, color) => {
	var coords = exports.get_square_coord(player_id, grank, gfile);
	var x = coords[0], y = coords[1];

	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(x-exports.square_size, y);
	ctx.lineTo(x, y-exports.square_size);
	ctx.lineTo(x+exports.square_size, y);
	ctx.lineTo(x, y+exports.square_size);
	ctx.lineTo(x-exports.square_size, y);
	ctx.closePath();
	ctx.fill();
    };

    exports.draw_move_indicator = (ctx, player_id, grank, gfile) => {
	var coords = exports.get_square_coord(player_id, grank, gfile);
	var x = coords[0], y = coords[1];

	ctx.fillStyle = exports.move_indicator_col;
	ctx.beginPath();
	ctx.arc(x, y, 10, 0, 2 * Math.PI);
	ctx.fill();
    };

    exports.draw_piece = (ctx, player_id, grank, gfile, piece) => {
	var offset_x = -30, offset_y = -34; // found manually, to make piece positioning look good
	var coords = exports.get_square_coord(player_id, grank, gfile);

	if (piece != '')
	    ctx.drawImage(exports.piece_images[piece],
			  coords[0]+offset_x, coords[1]+offset_y,
			  1.1*exports.square_size, 1.1*exports.square_size);
    };

    exports.draw_board = (ctx, player_id, board) => {
	for (var grank = 0; grank <= 7; grank++) {
	    for (var gfile = 0; gfile <= 7; gfile++) {
		var piece = board[grank][gfile];
		exports.draw_square(ctx, player_id, grank, gfile, exports.get_square_color(grank, gfile));
		exports.draw_piece(ctx, player_id, grank, gfile, piece);
	    }
	}
    };

    exports.highlight_square = (ctx, player_id, board, grank, gfile) => {
	exports.draw_square(ctx, player_id, grank, gfile, exports.highlight_col);
	var piece = board[grank][gfile];
	if (piece != '')
	    exports.draw_piece(ctx, player_id, grank, gfile, piece);
    };

    exports.draw_legal_moves = (ctx, player_id, board, grank, gfile, legal_moves) => {
	exports.highlight_square(ctx, player_id, board, grank, gfile);
	exports.cur_highlight_square = [grank, gfile];

	legal_moves.forEach((move) => {
	    var old_grank, old_gfile, new_grank, new_gfile;
	    [old_grank, old_gfile, new_grank, new_gfile] = move;
	    if (grank == old_grank && gfile == old_gfile)
		exports.draw_move_indicator(ctx, player_id, new_grank, new_gfile);
	});
    };

    exports.load_piece_image = (piece) => {
	return new Promise((resolve, reject) => {
	    var img = new Image();
	    img.onload = () => resolve([img, piece]);
	    img.src = '../images/' + piece + '.svg';
	});
    };

    exports.load_piece_images = (after) => {
	var pieces = ['wp', 'wr', 'wn', 'wb', 'wq', 'wk',
		    'bp', 'br', 'bn', 'bb', 'bq', 'bk']
	Promise.all(pieces.map(exports.load_piece_image)).then(datas => {
	    // store images
	    datas.forEach((data, idx) => {
		var img = data[0], piece = data[1];
		exports.piece_images[piece] = img;
	    });

	    after();
	});
    };
})(typeof exports === 'undefined' ? this.render = {} : exports);
