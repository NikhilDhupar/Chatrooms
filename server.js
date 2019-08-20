var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var ejs = require('ejs');
var session = require('express-session');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

app.use(session({
  secret: "xYzIAMNikhil",
  resave: false,
  saveUninitialized: true,
}));

//Acces static files
app.use(express.static(path.join(__dirname, 'public')));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

//Bodyparser
app.use(express.urlencoded({
  extended: true
}));
app.use(express.json());

//Connect with db
var mongoDB = 'mongodb://localhost/chatrooms';

mongoose.connect(mongoDB, {
  useNewUrlParser: true
});

mongoose.connection.on('error', (err) => {
  console.log('DB connection Error');
});

mongoose.connection.on('connected', (err) => {
  console.log('DB connected');
});

var userSchema = new mongoose.Schema({
  lastseen: Date,
  isonline: Boolean,
  name: { unique: true, type: String },
  phno: String,
  password: String,
  personalRooms: [{ type: Schema.Types.ObjectId, ref: "personalRooms" }],
  groups: [{ type: Schema.Types.ObjectId, ref: "groups" }],
  friends: [{ type: Schema.Types.ObjectId, ref: "users" }]
});

var personalRoomSchema = new mongoose.Schema({
  users: [{ type: Schema.Types.ObjectId, ref: "users" }],
  messages: [{ type: Schema.Types.ObjectId, ref: "chats" }],
});

var chatSchema = new mongoose.Schema({
  user: String,
  time: Date,
  text: String,
});

var groupSchema = new mongoose.Schema({
  creator: String,
  name: String,
  admins: [{ type: Schema.Types.ObjectId, ref: "users" }],
  members: [{ type: Schema.Types.ObjectId, ref: "users" }],
  messages: [{ type: Schema.Types.ObjectId, ref: "chats" }],
})

var user = mongoose.model('users', userSchema);
var personalRoom = mongoose.model('personalRooms', personalRoomSchema);
var chat = mongoose.model('chats', chatSchema);
var group = mongoose.model('groups', groupSchema);

var socketmapping = {}

io.on('connection', function (socket) {
  socket.on('createpersonalchatroom', function (msg) {
    socket.join(msg.roomid);

    socketmapping[socket.id] = {
      userid: msg.myid,
      roomid: msg.roomid,
      myname: msg.myname,
    };
    io.in(msg.roomid).emit('logged in', msg);

    user.updateOne({
      '_id': msg.myid,
      name: msg.myname,
    }, {
        lastseen: new Date(),
        isonline: true,
      }).exec();
  });

  socket.on('disconnect', function () {
    let obj = socketmapping[socket.id];
    if (socketmapping[socket.id]) {
      delete socketmapping[socket.id];
      user.updateOne({
        "_id": obj.userid,
      }, {
          isonline: false,
          lastseen: new Date(),
        }).exec();
      io.to(obj.roomid).emit('user disconnect', obj.myname);
    }
  });

  socket.on('check online', function (msg) {
    personalRoom.find({
      '_id': msg.roomid,
    }).then((data) => {
      if (msg.myid == data[0].users[0]) {
        user.find({
          "_id": data[0].users[1],
        }).then((data) => {
          if (data[0].isonline) {
            io.in(msg.roomid).emit('online', data[0].name);
          } else {
            io.in(msg.roomid).emit('last seen', data[0].lastseen);
          }
        })
      } else {
        user.find({
          "_id": data[0].users[0],
        }).then((data) => {
          if (data[0].isonline) {
            io.in(msg.roomid).emit('online', data[0].name);
          } else {
            io.in(msg.roomid).emit('last seen', data[0].lastseen);
          }
        })
      }
    });
  });

  socket.on('creategroupchatroom', function (room) {
    socket.join(room);
  });

  socket.on('personal message', (msg) => {
    io.in(msg.roomid).emit('personal message', msg);
    let newchat = new chat({
      user: msg.myname,
      text: msg.message,
    });
    newchat.save().then((data) => {
      personalRoom.updateOne({
        "_id": msg.roomid,
      }, {
          $addToSet: { "messages": data._id }
        }).exec();
    })
  });

  socket.on('group message', (msg) => {
    io.in(msg.roomid).emit('group message', msg);
    let newchat = new chat({
      user: msg.myname,
      text: msg.message,
    });
    newchat.save().then((data) => {
      group.updateOne({
        "_id": msg.roomid,
      }, {
          $addToSet: { "messages": data._id }
        }).exec();
    })
  });

  socket.on('typing', (msg) => {
    io.in(msg.roomid).emit('typing', msg);
  })

  socket.on('stop typing', (msg) => {
    io.in(msg.roomid).emit('stop typing', msg);
  })
});

app.get('/', function (req, res) {
  res.redirect('/index.html');
});

app.get('/user/login', function (req, res) {
  res.render('login')
});

app.get('/user/register', function (req, res) {
  res.render('register')
});

app.post('/user/login', function (req, res) {
  user.find({
    "name": req.body.name,
    "phno": req.body.phno,
    "password": req.body.password,
  })
    .then(data => {
      if (data.length != 0) {
        req.session.islogin = 1;
        req.session.name = data[0].name;
        req.session.iid = data[0]._id;
        res.redirect('/user/home');
      } else {
        res.redirect('/user/login');
      }
    })
    .catch(err => {
      console.error(err)
      res.send(err);
    })
});
app.post('/user/register', function (req, res) {
  user.find({
    "name": req.body.name,
    "phno": req.body.phno,
    "password": req.body.password,
  })
    .then(data => {
      if (data.length == 0) {
        let newuser = new user({
          name: req.body.name,
          phno: req.body.phno,
          password: req.body.password,
        })
        newuser.save().then(data => {
          req.session.islogin = 1;
          req.session.name = data.name;
          req.session.iid = data._id;
          //req.session.id is not getting stored i don't know why.
          res.redirect('/user/home');
        })
      } else {
        res.redirect('/index.html');
      }
    })
    .catch(err => {
      console.error(err)
      res.send(err);
    })
});

app.get('/user/home', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    user.find({
      "name": req.session.name,
      // "_id": req.session.iid,
    })
      .then(data => {
        if (data.length != 0) {
          res.render('homepage', {
            user: data[0],
          });
        } else {
          res.redirect('/index.html');
        }
      })
  }
});

app.get('/user/allusers', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    user.find({
      "name": req.session.name,
      "_id": req.session.iid,
    }).populate('friends', '_id')
      .exec((err, data) => {
        if (err) return err;
        if (data.length != 0) {
          user.find({
            "_id": { $nin: data[0].friends }
          }).then((data) => {
            res.render('userlist', {
              user: data,
            });
          })
        } else {
          res.redirect('/index.html');
        }
      })
  }
});

app.get('/user/startchat/:friendid', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    personalRoom.find({
      "users": { $all: [req.session.iid, req.params.friendid] }
    }).then(data => {
      if (data.length != 0) {
        res.redirect('/mychats/' + data[0]._id);
      } else {
        var newroom = new personalRoom({
          users: [req.session.iid, req.params.friendid]
        });
        newroom.save().then((data) => {
          user.updateMany({
            "_id": { $in: data.users }
          }, {
              $addToSet: { "personalRooms": data._id, friends: { $each: data.users } }
            }).exec();
          res.redirect('/mychats/' + data._id);
        })
      }
    })
  }
});

app.get('/user/myfriends', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    user.find({
      "name": req.session.name,
      "_id": req.session.iid,
    }).populate('friends', 'name _id')
      .exec((err, data) => {
        if (err) return err;
        if (data.length != 0) {
          res.render('myfriends', {
            user: data[0].friends,
            myname: data[0].name,
          });
        } else {
          res.redirect('/index.html');
        }
      })
  }
});

app.get('/user/mygroups', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    user.find({
      "name": req.session.name,
      "_id": req.session.iid,
    }).populate('groups', 'name _id')
      .exec((err, data) => {
        if (err) return err;
        if (data.length != 0) {
          res.render('mygroups', {
            groups: data[0].groups,
          });
        } else {
          res.redirect('/index.html');
        }
      })
  }
});

app.get('/user/creategroup', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    user.find({
      "name": req.session.name,
      "_id": req.session.iid,
    }).populate('friends', 'name _id')
      .exec((err, data) => {
        if (err) return err;
        if (data.length != 0) {
          res.render('addgroup', {
            user: data[0].friends,
            myname: data[0].name,
            myid: data[0].id,
          });
        } else {
          res.redirect('/index.html');
        }
      })
  }
});

app.post('/user/creategroup', function (req, res) {
  let newgroup = new group({
    name: req.body.groupname,
    creator: req.body.creatorname,
    admins: [req.body.creatorid],
    members: req.body.members,
  });
  newgroup.save().then((data) => {
    user.updateMany({
      $or: [{ _id: { $in: data.members } }, { _id: { $in: data.admins } }],
    }, {
        $addToSet: { "groups": data._id }
      }).exec();
    res.send("done");
  })
});

app.get('/mychats/:roomid', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    personalRoom.find({
      "_id": req.params.roomid
    }).populate('messages').populate('users', 'name _id')
      .exec((err, data) => {
        if (err) return err;
        if (data.length != 0) {
          let displayname = '';
          if (data[0].users[0].name == req.session.name) {
            displayname = data[0].users[1].name;
          } else {
            displayname = data[0].users[0].name;
          }
          res.render('personalchat', {
            displayname: displayname,
            myname: req.session.name,
            myid: req.session.iid,
            messages: data[0].messages,
            roomid: req.params.roomid,
          });
        } else {
          res.redirect('/home/users');
        }
      })
  }
});

app.get('/group/:groupid', function (req, res) {
  if (!req.session.islogin) {
    res.redirect('/index.html');
  } else {
    group.find({
      "_id": req.params.groupid
    }).populate('messages').populate('users', 'name _id')
      .exec((err, data) => {
        if (err) return err;
        if (data.length != 0) {
          res.render('groupchat', {
            displayname: data[0].name,
            myname: req.session.name,
            messages: data[0].messages,
            roomid: req.params.groupid,
          });
        } else {
          res.redirect('/home/users');
        }
      })
  }
});

app.post('/logout', function (req, res) {
  req.session.iid = '';
  req.session.destroy(() => {
    res.redirect('/');
  });
})

server.listen(3000);
console.log('Running on port 3000');