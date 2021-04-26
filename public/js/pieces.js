((exports) => {
    exports.WHITE = 0;
    exports.BLACK = 1;
    exports.EMPTY = 2;
    exports.UNDEFINED = 3;

    exports.get_player_color = (player_id) => {
	if (player_id % 2 == 0)
	    return exports.WHITE;
	else
	    return exports.BLACK;
    }

    exports.get_color = (piece) => {
	var c = piece.charAt(0);
	if (c == 'w')
	    return exports.WHITE;
	else if (c == 'b')
	    return exports.BLACK;
    }

    exports.get_type = (piece) => {
	if (piece == '')
	    return exports.EMPTY;

	return piece.charAt(1);
    }

    exports.is_player_white = (player_id) => {
	return exports.get_player_color(player_id) == exports.WHITE;
    }

    exports.is_white = (piece) => {
	return exports.get_color(piece) == exports.WHITE;
    }

    exports.is_empty = (piece) => {
	return exports.get_type(piece) == exports.EMPTY;
    }

    exports.same_colors = (piece1, piece2) => {
	return exports.get_color(piece1) == exports.get_color(piece2);
    }
})(typeof exports === 'undefined' ? this.pieces = {} : exports);
