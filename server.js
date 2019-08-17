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
  name: { unique: true, type: String },
  phno: String,
  password: String,
  personalRooms: [{ type: Schema.Types.ObjectId, ref: "personalRooms" }],
  groups: [{ type: Schema.Types.ObjectId, ref: "groupRooms" }],
  friends: [{ type: Schema.Types.ObjectId, ref: "users" }]
});

var personalRoomSchema = new mongoose.Schema({
  users: [{ type: Schema.Types.ObjectId, ref: "users" }],
  messages: [{ type: Schema.Types.ObjectId, ref: "chats" }],
});

var chatSchema = new mongoose.Schema({
  user: { type: Schema.Types.ObjectId, ref: "users" },
  time: Date,
});

var groupSchema = new mongoose.Schema({
  creator: String,
  admins: [{ type: Schema.Types.ObjectId, ref: "users" }],
  members: [{ type: Schema.Types.ObjectId, ref: "users" }],
  messages: [{ type: Schema.Types.ObjectId, ref: "chats" }],
})

var user = mongoose.model('users', userSchema);
var personalRoom = mongoose.model('personalRooms', personalRoomSchema);
var chat = mongoose.model('chats', chatSchema);
var group = mongoose.model('groups', groupSchema);

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
      "name": { $ne: req.session.name },
      // "_id": req.session.iid,
    })
      .then(data => {
        if (data.length != 0) {
          res.render('userlist', {
            user: data,
          });
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
          console.log(data[0].friends);
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

app.post('/logout', function (req, res) {
  req.session.iid = '';
  req.session.destroy(() => {
    res.redirect('/');
  });
})

server.listen(3000);
console.log('Running on port 3000');