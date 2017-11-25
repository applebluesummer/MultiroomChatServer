// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");

// Listen for HTTP connections.  
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
 
	fs.readFile("client6.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		if(err) return resp.writeHead(500);
		resp.writeHead(200, {'Content-Type': 'text/html'});
		resp.end(data);
    });
});
app.listen(3456);

// rooms which are currently created
var rooms = {'Lobby':{
			'creator':'null',
			'password':'null',
			'users': [],
			'ban': []
			}};

// use socket.io
var io = socketio.listen(app);
io.sockets.on("connection", function (socket){
    // This callback runs when a new Socket.IO connection is established.
    // listen and execute adduser
    socket.on("adduser", function (username){
    	// store the username in the socket session
    	socket.username = username;
    	socket.room = 'Lobby';
    	// add client's username to lobby's users list
    	rooms[socket.room].users.push(username);
    	// join the room lobby
    	socket.join('Lobby');
    	// join its private channel
    	socket.join(username);
    	// send the server message to the user to confirm joining
    	socket.emit('send_chat', 'Server-msg', 'you are in the lobby');
    	// send the server message to whoever in the lobby
    	socket.broadcast.to('Lobby').emit('send_chat', 'Server-msg', username + ' is in the Lobby');
    	// update the room list to the user
    	socket.emit('updaterooms', rooms, 'Lobby');
    	// update the userlist to whoever in the lobby
    	io.sockets.in(socket.room).emit('updateusers', rooms, socket.room);
    	// log it to node.js output
    	console.log(username + " just joined the Lobby");
    	socket.emit("hello", username);
    });

    socket.on('create_room', function (room, password){
    	// push new room to the rooms object
    	rooms[room] = {
			'creator':socket.username,
			'password':password,
			'users': [],
			'ban': []
			};
    	// update the room list of all users
    	io.sockets.emit('updaterooms', rooms, socket.room);

    	console.log(room + " has been created by " + socket.username);
    });

    socket.on('send_roomchat', function(data){
    	// update the chat message to the current room
    	io.sockets.in(socket.room).emit('send_chat', socket.username, data);
    	console.log(socket.username + ' : ' + data);
    });

    socket.on('send_prichat', function (data, touser){
    	socket.broadcast.to(touser).emit('send_chat', "Private-msg from "+socket.username, data);
    	io.sockets.in(socket.username).emit('send_chat', "Private-msg to "+touser, data);
    	//socket.broadcast.to(socket.username).emit('send_chat', "Private-msg to "+touser, data);
    	console.log("Private-msg from "+socket.username+" to "+touser+" : "+data);
    });

    socket.on('checkRoom', function (newroom){
    	// check weather the user just entered is the creator 
    	socket.emit('checkcreator', rooms[newroom].creator);
    	// check whether the user is banned from the new room
    	var temp_banuser = "null";
    	for (var i = 0; i < rooms[socket.room].ban.length; i++) {
			if (rooms[socket.room].ban[i] == socket.username) {
				temp_banuser = socket.username;
			} 
		}
		socket.emit('checkbanned', newroom, temp_banuser);
		// check whether newroom is a private room
    	if (rooms[newroom].password != "") {
    		// if it is, emit its password
    		socket.emit('checkPass', newroom, rooms[newroom].password);
    	} else {
    		// if not, emit null
    		socket.emit('checkPass', newroom, "null");
    	}
    });

    socket.on('switchRoom', function (newroom){
    	// leave the old room and join the new room
    	var preroom = socket.room;
    	socket.room = newroom;
    	socket.leave(preroom);
        // remove user from the old room's user list
        var index = rooms[preroom].users.indexOf(socket.username);
		if (index > -1) {
    		rooms[preroom].users.splice(index, 1);
		}
		// update the user list in old room
        io.sockets.in(preroom).emit('updateusers', rooms, preroom);
        
        socket.join(newroom);
        // add user to the new room's user list
		rooms[newroom].users.push(socket.username);
		// update the user list in new room
        io.sockets.in(newroom).emit('updateusers', rooms, newroom);
        // broadcast message to the old and new room
        socket.emit('send_chat', 'Server-msg', 'you are now in ' + newroom);
        socket.broadcast.to(preroom).emit('send_chat', 'Server-msg', socket.username + ' just left ' + preroom);
        
        socket.broadcast.to(newroom).emit('send_chat', 'Server-msg', socket.username + ' joined ' + newroom + ', Welcome!');
        // update the user's room list
        io.sockets.in(newroom).emit('updaterooms', rooms, newroom);
        
    	console.log(socket.username + ' switched from ' + preroom + ' to ' + newroom);
    });

	socket.on('kick_out_check', function (cur_room, usertokick){
		// check whether the input username is current in the room
		var temp_user = "null";
		for (var i = 0; i < rooms[socket.room].users.length; i++) {
			
			if (rooms[socket.room].users[i] == usertokick) {
				temp_user = usertokick;
			} 
		}
		
		socket.emit('kickOut', temp_user);
	});

	socket.on('ban_user_check', function (cur_room, usertoban){
		// check whether the input username is current in the room
		var temp_user = "null";
		for (var i = 0; i < rooms[socket.room].users.length; i++) {
			
			if (rooms[socket.room].users[i] == usertoban) {
				temp_user = usertoban;
			} 
		}
		
		socket.emit('banUser', temp_user);
	});

	socket.on('kick_out', function (usertokick){
		io.sockets.in(socket.room).emit('send_chat', 'Server-msg', usertokick + " has been kicked out from " + socket.room + " by the creator");
		io.sockets.in(usertokick).emit('kick_out_client', usertokick);
		console.log(usertokick+" has been kicked out from " + socket.room);
	});

	socket.on('ban_user', function (usertoban){
		io.sockets.in(socket.room).emit('send_chat', 'Server-msg', usertoban + " has been banned from " + socket.room + " by the creator");
		// add the username to the ban list
		rooms[socket.room].ban.push(usertoban);
		io.sockets.in(usertoban).emit('kick_out_client', usertoban);
		console.log(usertokick+" has been banned from " + socket.room);
	});

    socket.on('disconnect', function(){
    	socket.leave(socket.room);
    	// remove user from current room's user list
     	if (typeof rooms[socket.room] != "undefined") {
     		var index = rooms[socket.room].users.indexOf(socket.username);
     		if (index > -1) {
     			rooms[socket.room].users.splice(index, 1);
			}
			io.sockets.in(socket.room).emit('updateusers', rooms, socket.room);
     	}
    	// broadcast disconnection message
    	socket.broadcast.emit('send_chat', 'Server-msg', socket.username + ' left the Chat Room Server');
    	
    	console.log(socket.username + ' has disconnected');
    });
});