var LocalStrategy = require('passport-local').Strategy,
    passport = require('passport');

module.exports = (function(){

    var self = this,
        users = [
            { id: 1, username: 'gareth', password: process.env.pw_gareth},
            { id: 2, username: 'curator', password: process.env.pw_curator}
        ],

        findById = function(id, fn) {
            var idx = id - 1;
            if (users[idx]) {
                fn(null, users[idx]);
            } else {
                fn(new Error('User ' + id + ' does not exist'));
            }
        },

        findByUsername = function(username, fn) {
            for (var i = 0, len = users.length; i < len; i++) {
                var user = users[i];
                if (user.username === username) {
                    return fn(null, user);
                }
            }
            return fn(null, null);
        },

        ensureAuth = function(req, res, next) {
            if (req.isAuthenticated()) { return next(); }
            res.redirect('/login')
        },

        init = function(){

            passport.serializeUser(function(user, done) {
                done(null, user.id);
            });

            passport.deserializeUser(function(id, done) {
                findById(id, function (err, user) {
                    done(err, user);
                });
            });

            var ls = new LocalStrategy(
                        function(username, password, done) {
                            // asynchronous verification, for effect...
                            process.nextTick(function () {

                                findByUsername(username, function(err, user) {
                                    if (err) { return done(err); }
                                    if (!user) { return done(null, false, { message: 'Unknown user ' + username }); }
                                    if (user.password != password) { return done(null, false, { message: 'Invalid password' }); }
                                    return done(null, user);
                                })
                            });
                        });
            passport.use(ls);


        };

    return {
        init : init,
        ensureAuth : ensureAuth
    };

})();
