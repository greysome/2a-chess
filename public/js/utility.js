((exports) => {
    exports.randint = (min, max) => {
	return Math.round(Math.random()*(max-min) + min);
    }

    /*
      A version of `Array.includes()` that works when the parameter is
      an array
    */
    exports.array_includes = (src, array) => {
	for (var i = 0; i < src.length; i++) {
	    var a = src[i];

	    if (array.length != a.length)
		continue;

	    // compare equality of element of `src` with `array`
	    var arrays_eq = true;
	    for (var j = 0; j < a.length; j++)
		if (array[j] != a[j])
		    arrays_eq = false;

	    if (arrays_eq)
		return true;
	}

	return false;
    }

    /*
      Given an orthogonal basis {w1, ..., wn}, `component(v, wi)`
      returns the component of v wrt wi
    */
    exports.component = (v, w) => {
	return (v[0]*w[0] + v[1]*w[1]) / (w[0]**2 + w[1]**2);
    }

    /*
      Each square has two types of coordinates: local and global.

      Global coordinates refer to the actual coordinates as stored in
      `board` (an 8x8 array).

      However, from different players' perspective, the board is
      displayed at different angles, just as the board appears flipped
      from Black's perspective in normal chess. Local coordinates
      refer to the coordinates as seen from the player's
      perspective. Note that local coordinates of the same piece will
      vary across players while global coordinates are the same.
      
      The default coordinate system is the rank/file coordinate
      system, but others can be used.
    */

    exports.global_to_local_coords = (player_id, grank, gfile) => {
	/*
	  Setup a new coordinate system A: the origin is the center of
	  the board, and moving in the x/y-axis correspond to moving
	  across files/ranks.

	  1. Let v be the global rank/file-coordinates. The global
	  A-coordinates v' is an offset version of v.

	  2. The local A-coordinates w' is obtained by applying a i*90
	  degree transformation matrix to v', where i depends on the
	  player.
	  
	  3. Return the local rank/file coordinates w, which is an
	  offset version of w'.
	*/
	var A_rank = grank-3.5, A_file = gfile-3.5;
	for (var i = 0; i < player_id; i++) {
	    var tmp = A_rank;
	    A_rank = A_file;
	    A_file = -tmp;
	}
	return [A_rank+3.5, A_file+3.5];
    }

    exports.local_to_global_coords = (player_id, lrank, lfile) => {
	/*
	  Same as `global_to_local_coords()` but in step 2, apply an
	  -i*90 degree transformation matrix instead of a i*90 degree
	  one.
	 */
	return exports.global_to_local_coords(4-player_id, lrank, lfile);
    }
})(typeof exports === 'undefined' ? this.utility = {} : exports);
