const utility = require('./utility');
const pieces = require('./pieces');

/*
  Return array of [rank, file], where the piece at (rank, file) can
  be moved by player
*/
module.exports.movable_pieces = (player_id, board) => {
    var squares = [];

    /*
      A piece can be moved by the player only lrank+lfile <= 8, where
      lrank/lfile are the local rank/file coordinates.
    */
    for (var lrank = 0; lrank < 8; lrank++) {
	for (var lfile = 0; lfile < 8-lrank; lfile++) {
	    var grank, gfile;
	    [grank, gfile] = utility.local_to_global_coords(player_id, lrank, lfile);
	    var piece = board[grank][gfile];

	    // square is empty
	    if (pieces.is_empty(piece))
		continue;

	    // piece is of the wrong color
	    if ((pieces.is_player_white(player_id) && !pieces.is_white(piece)) ||
	        (!pieces.is_player_white(player_id) && pieces.is_white(piece)))
		continue;

	    squares.push([grank, gfile]);
	}
    }

    return squares;
}

/*
  Return array of legal moves [old_grank, old_gfile, new_grank, new_gfile]
  along the ray (grank + i*d_grank, grank + i*d_gfile), where
  1 <= i <= max_length
*/
module.exports.ray_moves = (board, grank, gfile, d_grank, d_gfile, max_length) => {
    var old_piece = board[grank][gfile];
    var color = pieces.get_color(old_piece);
    var new_square;
    var moves = [];

    for (var i = 1; i <= max_length; i++) {
	var new_grank = grank + i*d_grank, new_gfile = gfile + i*d_gfile;
	if (new_grank < 0 || new_grank >= 8 || new_gfile < 0 || new_gfile >= 8)
	    break;

	var new_piece = board[new_grank][new_gfile];
	if (pieces.is_empty(new_piece)) {
	    // empty square
	    moves.push([grank, gfile, new_grank, new_gfile]);
	    continue;
	}
	else if (pieces.same_colors(old_piece, new_piece)) {
	    // blocked by same color piece
	    break;
	}
	else {
	    moves.push([grank, gfile, new_grank, new_gfile]);
	    break;
	}
    }

    return moves;
}

/*
  Like `ray_moves()`, but checks legal moves along multiple
  rays. `d_rankfiles` is an array of [d_rank, d_file] and
  `max_lengths` is an array of max_length.
*/
module.exports.multiple_ray_moves = (board, grank, gfile, d_rankfiles, max_lengths) => {
    var moves = [];
    for (var i = 0; i < d_rankfiles.length; i++) {
	var d_grank = d_rankfiles[i][0], d_gfile = d_rankfiles[i][1];
	var max_length = max_lengths[i];
	moves = moves.concat(
	    module.exports.ray_moves(board, grank, gfile, d_grank, d_gfile, max_length)
	);
    }
    return moves;
}

/*
  Return array of [old_grank, old_gfile, new_grank, new_gfile], where
  piece at (old_grank, old_gfile) can be moved to (new_grank, new_gfile)
*/
module.exports.legal_moves = (player_id, board) => {
    var moves = [];
    module.exports.movable_pieces(player_id, board).forEach((coords) => {
	var grank = coords[0], gfile = coords[1];
	var piece = board[grank][gfile];
	var type = pieces.get_type(piece);

	if (type == 'p') {
	    // Normal moves
	    var normal_moves = (pieces.is_white(piece) ? [[1,1],[-1,-1]] : [[1,-1],[-1,1]]);
	    normal_moves.forEach((d) => {
		var d_grank = d[0], d_gfile = d[1];
		if (grank+d_grank < 0 || grank+d_grank >= 8 ||
		    gfile+d_gfile < 0 || gfile+d_gfile >= 8) {
		    return;
		}

		var other_piece = board[grank+d_grank][gfile+d_gfile];
		if (pieces.is_empty(other_piece))
		    moves.push([grank, gfile, grank+d_grank, gfile+d_gfile]);
	    });

	    // Capture moves
	    [[1,0],[0,1],[-1,0],[0,-1]].forEach((d) => {
		var d_grank = d[0], d_gfile = d[1];
		if (grank+d_grank < 0 || grank+d_grank >= 8 ||
		    gfile+d_gfile < 0 || gfile+d_gfile >= 8) {
		    return;
		}

		var other_piece = board[grank+d_grank][gfile+d_gfile];
		if (!pieces.is_empty(other_piece) && !pieces.same_colors(piece, other_piece))
		    moves.push([grank, gfile, grank+d_grank, gfile+d_gfile]);
	    });
	}
	else if (type == 'n') {
	    moves = moves.concat(
		module.exports.multiple_ray_moves(
		    board, grank, gfile,
		    [[1,2],[-1,2],[1,-2],[-1,-2],
		     [2,1],[-2,1],[2,-1],[-2,-1]],
		    [1,1,1,1,1,1,1,1]
		)
	    );
	}
	else if (type == 'b') {
	    moves = moves.concat(
		module.exports.multiple_ray_moves(
		    board, grank, gfile,
		    [[1,1],[-1,1],[1,-1],[-1,-1]],
		    [7,7,7,7]
		)
	    );
	}
	else if (type == 'r') {
	    moves = moves.concat(
		module.exports.multiple_ray_moves(
		    board, grank, gfile,
		    [[1,0],[0,1],[-1,0],[0,-1]],
		    [7,7,7,7]
		)
	    );
	}
	else if (type == 'k') {
	    moves = moves.concat(
		module.exports.multiple_ray_moves(
		    board, grank, gfile,
		    [[1,0],[0,1],[-1,0],[0,-1],
		     [1,1],[-1,1],[1,-1],[-1,-1]],
		    [1,1,1,1,1,1,1,1]
		)
	    );
	}
    });

    return moves;
}

module.exports.lost_yet = (board, color) => {
    if (color == pieces.WHITE)
	return !board.flat().includes('wk');
    else if (color == pieces.BLACK)
	return !board.flat().includes('bk');
}
