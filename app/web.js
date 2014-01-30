// App modules.
var config = require("./config"),
    db = require("./db"),
    auth = require('./auth'),
    instagram = require("./instagram"),
    twitter = require("./twitter");

// Vendor modules.
var express = require('express'),
    app = express(),
    hbs = require('hbs'),
    https = require('https'),
    Q = require('q'),
    cors = require('cors'),
    passport = require('passport'),
    flash = require('connect-flash');

// -- Express and socket configuration.
var server = app.listen(config.express.port),
    io = require('socket.io').listen(server);

app.set('view engine', 'html');
app.set('views', __dirname + '/views');
app.engine('html', hbs.__express);
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static(__dirname + '/public'));
app.use(cors());
app.use(express.cookieParser());
app.use(express.session({ secret: 'keyboard cat' }));
app.use(express.methodOverride());
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// -- Init app modules.
db.connect();
auth.init();
// Contains express routes and logic for retreiving content.
instagram.init( app, auth, io );
twitter.init( app, auth, io );

// Routes.
app.get('/', auth.ensureAuth, function(req, response){
    db.collection.find().sort({ created_time : -1 })
        .toArray(function( err, results ){
            response.render('contentitems', { contentitem : results, user: req.user } );
        });
});

app.get('/get/selected', auth.ensureAuth, function(req, response){
    db.collection.find({selected : true})
           .sort({ created_time : -1 })
           .toArray(function( err, results ){
                response.render('contentitems', { contentitem : results, user: req.user } );
            });
});

app.get('/get/date/:date', auth.ensureAuth, function(req, response){

    var d = {}, date = req.params.date,
        year = date.substr(0,4),
        month = Number(date.substr(4,2))-1,
        day = date.substr(6,2),
        startsec, endsec;

    if( date.length !== 8 ){
        response.render('message', { message : "Date must be 8 digits long in this format YYYYMMDD. Example: 1st January 2014 = 20140101", user: req.user } );
        return;
    }

    d = new Date(year, month, day);
    startsec = Number(d.getTime()/1000);
    endsec = Number(startsec+(60*60*24));

    var find = { created_time : { $gte : startsec, $lt : endsec }};

    db.collection.find(find)
           .sort({ created_time : -1 })
           .toArray(function( err, results ){
                response.render('contentitems', { contentitem : results, user: req.user } );
            });

});

app.get('/cleardata', auth.ensureAuth, function(req, response){
    response.render('removeall', { user: req.user });
});

app.get('/output.json', function(req, response){
    db.collection.find({ selected : true }).sort({ created_time : -1 })
        .toArray(function( err, results ){
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(results));
        });
});

// Authentication routes.
app.get('/login', function(req, res){
      res.render('login', { 
          user: req.user, message: req.flash('error') 
      });
});

app.get('/logout', function(req, res){
    req.logout();
    res.redirect('/');
});

app.post('/login', 
        passport.authenticate('local', { 
            failureRedirect: '/login', failureFlash: true 
        }),
        function(req, res) {
            res.redirect('/');
});

app.post('/login',
        passport.authenticate('local', { successRedirect: '/',
            failureRedirect: '/login',
        failureFlash: true })
        );

// -- Sockets
io.sockets.on('connection', function (socket) {

    socket.on('removeall', function (data) {

        db.collection.remove(function(err, result) {
                        console.log("Remove callback", err, result);
                    });

    });

});
