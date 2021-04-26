$(document).ready(() => {
    $('#btn_create_room').click(() => {
	var username = $('#input_username').val();
	// TODO: sanitiser username
	if (username.length < 4) {
	    $('#txt_username_invalid').show();
	    return;
	}

	$.get('/create_room', (room_id) => {
	    window.location.replace(window.location.origin + '/play?id=' + room_id + '&username=' + username);
	});
    });

    $('#btn_join_room').click(() => {
	var room_id = $('#input_room_id').val();
	var username = $('#input_username').val();
	// TODO: sanitise username

	if (username.length < 4) {
	    $('#txt_username_invalid').show();
	    return;
	}

	if (room_id == '') {
	    $('#txt_room_id_invalid').show();
	    return;
	}

	$.get('/room_exists', {id: room_id}, (exists) => {
	    if (exists)
		window.location.replace(window.location.origin + '/play?id=' + room_id + '&username=' + username);
	    else
		$('#txt_room_id_invalid').show();
	});
    });
});
