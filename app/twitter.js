var twitter = module.exports,
    config = require("./config"),
    https = require('https'),
    cors = require('cors'),
    Q = require('q'),
    db = require("./db");

var hashtagdata = {};

var MTwitter = require('mtwitter'),
    mtwitter;

function initMTwitter(){
    mtwitter = new MTwitter({
        consumer_key: config.twitterckey,
        consumer_secret: config.twittercsecret,
        access_token_key: config.twitteratoken,
        access_token_secret: config.twitterasecret,
    });
}

function storenew( existing, fresh, designer ){

    var deferred = Q.defer();

    var keylist = [
            "location",
            "entities",
            "created_at",
            "id_str",
            "text",
            "user"
        ],
        map = {
            "created_at": "created_time",
            "id_str": "id"
        },
        toinsert = [],
        i;

    i = fresh.length;

    // Clean data of unwanted key:vals.
    while( i-- ){
        for(var key in fresh[i]){
            if( keylist.indexOf( key ) < 0 ){
                delete fresh[i][key]
            }
            // Map Tweet properties to Instagram names!
            if (map[key]) {
                var copy = map[key];
                fresh[i][copy] = fresh[i][key];
                delete fresh[i][key];
            }
            // Convert time to integer.
            if( key === "created_time" ){
                fresh[i][key] = Number(fresh[i][key]);
            }
        }
        if( designer ){
            // Add twitter_id here to makequerying eaiser.
            for(var key in designer ){
                fresh[i][key] = designer[key];
            }
        }
        fresh[i].type = "twitter";

        // Munge the rest
        var u = fresh[i]["user"],
            e = fresh[i]["entities"],
            user = {
                "username": u["screen_name"],
                "website": u["url"],
                "profile_picture": u["profile_image_url"],
                "full_name": u["name"],
                "bio": u["description"],
                "id": u["id"]
            };

        fresh[i]["user"] = user;
        fresh[i]['link'] = "https://twitter.com/" + user["username"] + "/status/" + fresh[i]["id"];

        var tags = [];
        for (var j = 0; j < e["hashtags"].length; j++) {
            tags.push(e["hashtags"][j]["text"]);
        }
        fresh[i]["tags"] = tags;

        if (e["media"]) {
            var image;
            for (var j = 0; j < e["media"].length; j++) {
                if (e["media"][j]["type"] === "photo") {
                    image = e["media"][j];
                    break;
                }
            }
            if (image) {
                fresh[i]["images"] = {
                    "low_resolution" : {
                        "url" : image["media_url"] + ":small",
                        "width": image["sizes"]["small"]["w"],
                        "height": image["sizes"]["small"]["h"]
                    },
                    "thumbnail" : {
                        "url" : image["media_url"] + ":thumb",
                        "width": image["sizes"]["thumb"]["w"],
                        "height": image["sizes"]["thumb"]["h"]
                    },
                    "standard_resolution" : {
                        "url" : image["media_url"] + ":medium",
                        "width": image["sizes"]["medium"]["w"],
                        "height": image["sizes"]["medium"]["h"]
                    }
                };
            }
        }
        delete fresh[i]["entities"];

        fresh[i]["caption"] = {text: fresh[i]["text"]};
        delete fresh[i]["text"];
    }

    // Created array of items to insert.
    i = fresh.length;
    while( i-- ){
        if( ! existing.length || fresh[i].created_time > existing[0].created_time) {
            toinsert.push( fresh[i] );
        }
    };

    // Do the insert if there are any newies.
    if( toinsert.length > 0 ){
        // Insert all at once rather than one at a time.
        db.collection.insert( toinsert, {w:1}, function( err, res ){
            if( ! err ){
                deferred.resolve( toinsert.length );
            } else {
                deferred.reject(new Error(err));
            }
        });
    } else {
        setTimeout(function(){
            deferred.resolve(0);
        }, 1);
    }

    return deferred.promise;

}

/*
function fetchhashtag( hashtag ){

    // Instagram API methods.
    var options = {
        host: 'api.instagram.com',
        port: 443,
        path: '/v1/tags/{hashtag}/media/recent/?client_id='
              + config.instagramclientid,
        method: 'GET'
    };

    options.path = options.path.replace(/{hashtag}/, hashtag);

    return makerequest( options );

}
*/

function fetchlatest( userid ){

    // If twitter not init, init
    if (!mtwitter) {
        initMTwitter();
    }

    // Twitter API methods.
    var options = {
        path: 'statuses/user_timeline',
        data: { screen_name: userid, include_rts: false }
    };

    return makerequest( options );

}

function makerequest( options ){

    var deferred = Q.defer();

    mtwitter.get(options.path, options.data,
        function (error, data, response) {
            if (error) {
                deferred.reject(new Error("Error getting Twitter feed. "+error));
            } else {
                deferred.resolve( data );
            }
        });

    return deferred.promise;

}

function getexisting( query ) {

    var deferred = Q.defer();
    query.type = "twitter";

    db.collection.find( query ).sort({ created_time : -1 })
        .toArray(function( err, res ){
            if( err != "null" ){
                deferred.resolve( res );
            } else {
                console.log("Error: find query error - " + err);
                deferred.reject(new Error(err));
            }
        });

    return deferred.promise;

}

function updatedesigner( designer ){

    var deferred = Q.defer();

    console.log("Get", designer.name);

    if (designer['twitter_id'] == '') {
        deferred.reject(new Error("No Twitter account found"));
    } else {

    db.connect().then(function(){

        Q.allSettled([
                getexisting({ twitter_id : designer.twitter_id }),
                fetchlatest(designer.twitter_id)
            ])
            .spread(function(existing, fresh){

                return storenew( existing.value, fresh.value, designer );

            })
            .then(function( inserted ){
                console.log("Inserted ", inserted, " for ", designer.name);
                deferred.resolve( inserted );

            })
            .fail(function(){

                deferred.reject();

            });

    });

    }

    return deferred.promise;
}

function getnewtweets( designers ){

    var deferred = Q.defer(),
        completetotal = 0,
        failedtotal = 0,
        insertstotal = 0;

    for (var i = 0; i < designers.length; i++) {

        console.log("Get new for ", designers[i].name);

        updatedesigner( designers[i] )
            .then(function( insertednum ){

                completetotal++;
                insertstotal += insertednum;

            })
            .fail(function(){

                failedtotal++;

            })
            .fin(function(){
                if( completetotal+failedtotal == designers.length ){
                    deferred.resolve({ insertednum: insertstotal, failednum : failedtotal });
                }
            });
    }

    return deferred.promise;
}

/*
function initsockets( io ){

    // -- Sockets
    io.sockets.on('connection', function (socket) {

        socket.on('deselect', function (id) {
            console.log("Deselect: " + id);
            db.collection.update({ id : id },
                        { $set: { selected : false }},
                        function(err, items){
                            console.log(err, items);
                        });

        });

        socket.on('select', function (id) {
            console.log("Select: " + id);
            var data = hashtagdata[id];

            db.collection.count({ id : id }, function(err, count) {

                if( count === 0 ){
                    data.selected = true;
                    console.log("Store new", data);
                    storenew([], [data]);

                } else {

                    db.collection.update({ id : id },
                                { $set: { selected : true }},
                                function(err, items){
                                    console.log("Updated", err, items);
                                });

                }

            });

        });

        socket.on('caption', function (data) {
            console.log("Update caption: " + data.id);

            db.collection.update({ id : data.id },
                    { $set: { custom_caption : data.caption }},
                    function(err, items){
                        console.log("Caption udpated.", err, items);
                    });
        });

        socket.on('tags', function (data) {
            console.log("Update tags: " + data.id);

            var tags = [];
            data.tags.split(",").forEach(function(tag){
                console.log(tag.trim(),tag.trim().match(/^[a-zA-Z0-9_]*$/));
                if( tag.trim() && tag.trim().match(/^[a-zA-Z0-9_]*$/)){
                    tags.push(tag.trim());
                }
            });

            if( tags.length ){
                db.collection.update({ id : data.id },
                        { $set: { custom_tags : tags }},
                        function(err, items){
                            console.log("Tags updated.", err, items);
                        });
            }

        });

    });

}
*/

function get( route, app, auth, action ){

    var doAuth = false;

    if( doAuth === true ){
        app.get(route, auth.ensureAuth, action);
    } else {
        app.get(route, action);
    }

}



twitter.init = function( app, auth, io ){

    // initsockets( io );

    // Links to other routes.
    var twitterhome = function(req, response){

        config.getdesigners()
            .then(function(designers){

                response.render('twitter', {
                    user: req.user,
                    designers : designers
                });

            });
    };
    get('/twitter', app, auth, twitterhome );

    // Select single designer by id.
    var selectdesigner = function(req, response){

        var designerid = req.params.designerid,
            query = { "user.username" : String( designerid ) };

        getexisting(query)
            .then(function(results){
                response.render('contentitems', {
                    contentitem : results, user: req.user
                });
            });

    };
    get('/twitter/select/designer/:designerid', app, auth, selectdesigner );

    // Show all designers.
    var selectdesigners = function(req, response){

        config.getdesigners()
            .then(function( designers ){

                var userids = [];
                for (var i = 0; i < designers.length; i++) {
                    userids.push(String(designers[i].twitter_id));
                };

                var query = {
                    "user.username" : { $in : userids }
                };

                getexisting(query)
                    .then(function(results){
                        response.render('contentitems', {
                            contentitem : results, user: req.user
                        });
                    });

            });

    };
    get('/twitter/select/designers', app, auth, selectdesigners );

    /*
    var selecthowforhashtag = function(req, response){

        var hashtag = req.params.hashtag,
            query = { tags : hashtag },
            fresh, existing, existingids = [];

        Q.allSettled([
                fetchhashtag(hashtag),
                getexisting(query)
            ])
            .spread(function(fresh, existing){

                fresh = fresh.value.data;
                existing = existing.value;
                // console.log("Existing", existing);

                // Get array of existing ids for easy searching.
                for (var i = 0; i < existing.length; i++) {
                    existingids.push( existing[i].id );
                };

                // Store fresh for possible insertion.
                for (var j = 0; j < fresh.length; j++) {
                    var freshid = fresh[j].id;
                    hashtagdata[freshid] = fresh[j];

                    // Add to existing array if not present.
                    if( existingids.indexOf( freshid ) < 0 ){
                        existing.push( hashtagdata[freshid] );
                    }
                };

                response.render('contentitems', {
                    user: req.user,
                    contentitem : existing
                });

            })
            .fail(function(err){
                console.log(err);
            });

    };
    get('/twitter/select/hashtag/:hashtag', app, auth, selecthowforhashtag );
    */

    // Show selected all (designers and others).
    var showselected = function(req, response){

        var query = {
            selected : true
        };

        getexisting(query)
            .then(function(results){
                response.render('contentitems', {
                    contentitem : results, user: req.user
                });
            });

    };
    get('/twitter/selected', app, auth, showselected );

    // Retrieve new designers content.
    var checkdesigners = function(req, response){

        config.getdesigners()
            .then(function( designers ){

                getnewtweets( designers )
                    .then(function( result ){
                        response.render('checknew', {
                            user: req.user,
                            inserts : result.insertednum,
                            failed : result.failednum
                        });

                    });
            })
            .fail(function(err){
                console.log("Error getting designers.json", err);

            });

    };
    get('/twitter/checknew/designers', app, auth, checkdesigners );

};
