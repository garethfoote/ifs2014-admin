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

function mungetweets( tweets ){

    i = tweets.length;

    while( i-- ){
        if (!tweets[i]["munged"]) {

            tweets[i]["id"] = tweets[i]["id_str"];
            tweets[i]["created_time"] = new Date(tweets[i]["created_at"]).getTime() / 1000

            var u = tweets[i]["user"],
                e = tweets[i]["entities"],
                user = {
                    "username": u["screen_name"],
                    "website": u["url"],
                    "profile_picture": u["profile_image_url"],
                    "full_name": u["name"],
                    "bio": u["description"],
                    "id": u["id"]
                };

            tweets[i]["user"] = user;
            tweets[i]['link'] = "https://twitter.com/" + user["username"] + "/status/" + tweets[i]["id"];

            var tags = [];
            for (var j = 0; j < e["hashtags"].length; j++) {
                tags.push(e["hashtags"][j]["text"]);
            }
            tweets[i]["tags"] = tags;

            // Media could be images, video etc - look for the first image only
            if (e["media"]) {
                var image;
                for (var j = 0; j < e["media"].length; j++) {
                    if (e["media"][j]["type"] === "photo") {
                        image = e["media"][j];
                        break;
                    }
                }
                if (image) {
                    tweets[i]["images"] = {
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
            delete tweets[i]["entities"];

            // Defaults
            if (!tweets[i]["images"]) {
                tweets[i]["images"] = false;
            }

            if (tweets[i]["coordinates"]) {
                tweets[i]["location"] = {
                    longitude: tweets[i]["coordinates"]["coordinates"][0],
                    latitude: tweets[i]["coordinates"]["coordinates"][1]
                }
            } else {
                tweets[i]["location"] = null;
            }

            tweets[i]["caption"] = {text: tweets[i]["text"]};
            delete tweets[i]["text"];

            // Once you munge, you'll never go back
            tweets[i]["munged"] = true;
        }
    }

    return tweets

}

function storenew( existing, fresh, designer ){

    var deferred = Q.defer();

    var keylist = [
            "location",
            "tags",
            "created_time",
            "link",
            "images",
            "type",
            "id",
            "user",
            "country",
            "caption",
            "selected",
            "munged"
        ],
        toinsert = [],
        i;

    // Munge ahoy!
    fresh = mungetweets(fresh);

    i = fresh.length;

    // Clean data of unwanted key:vals.
    while( i-- ){
        for(var key in fresh[i]){
            if( keylist.indexOf( key ) < 0 ){
                delete fresh[i][key]
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
        } else {
            // If no designer this will have no country.
            fresh[i].country = null;
        }
        fresh[i].type = "twitter";
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

function fetchhashtag( hashtag ){

    // Twitter API methods.
    var options = {
        path: 'search/tweets',
        data: { q: "#" + hashtag }
    };

    return makerequest( options );

}

function fetchlatest( userid ){

    // Twitter API methods.
    var options = {
        path: 'statuses/user_timeline',
        data: { screen_name: userid, include_rts: false }
    };

    return makerequest( options );

}

function makerequest( options ){

    // If twitter not init, init
    if (!mtwitter) {
        initMTwitter();
    }

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

                    deferred.resolve( inserted );

                })
                .fail(function(err){

                    deferred.reject(err);

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
            .fail(function( err ){

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


function get( route, app, auth, action ){

    var doAuth = true;

    if( doAuth === true ){
        app.get(route, auth.ensureAuth, action);
    } else {
        app.get(route, action);
    }

}

twitter.insertselected = function( id ){

    var data = hashtagdata[id];

    if( data ){

        data.selected = true;
        storenew([], [data]);

    } else {
        console.error("cannot find hashtag data");
        console.log("ERROR: cannot find hashtag data");
        console.log(id);

    }

}

twitter.init = function( app, auth, io ){

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

    var selecthashtag = function(req, response){

        var hashtag = req.params.hashtag,
            query = { tags : hashtag },
            fresh, existing, existingids = [];

        Q.allSettled([
                fetchhashtag(hashtag),
                getexisting(query)
            ])
            .spread(function(fresh, existing){

                fresh = mungetweets(fresh.value.statuses);
                existing = existing.value;
                // console.log("Existing", existing);

                // Get array of existing ids for easy searching.
                for (var i = 0; i < existing.length; i++) {
                    existingids.push( existing[i].id );
                    existing[i].type = "twitter";
                };

                // Store fresh for possible insertion.
                for (var j = 0; j < fresh.length; j++) {
                    // Only make this available if location is present.
                    // #tag items without location do not have default/fallback.
                    if( fresh[j].location ){

                        var freshid = fresh[j].id;
                        hashtagdata[freshid] = fresh[j];
                        hashtagdata[freshid].type = "twitter";

                        // Add to existing array if not present.
                        if( existingids.indexOf( freshid ) < 0 ){
                            existing.push( hashtagdata[freshid] );
                        }
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
    get('/twitter/select/hashtag/:hashtag', app, auth, selecthashtag );

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

    // Update all designers from designer.json.
    var updatefromdesigners = function(req, response){

        config.getdesigners()
            .then(function(designers){

                var allowedkeys = [
                        "name",
                        "country",
                        "home",
                        "venue"
                    ],
                    contentupdated = 0,
                    designersupdated = 0;

                for (var i = 0; i < designers.length; i++) {
                    var userid = String(designers[i].twitter_id),
                        set = {}, key;

                    // Create "set" object for update.
                    for (var j = 0; j < allowedkeys.length; j++) {
                        key = allowedkeys[j];
                        set[key] = designers[i][key];
                    };

                    db.collection.update({ "twitter_id" : userid },
                            { $set: set },
                            { multi : true },
                            function(err, items){
                                designersupdated++;
                                contentupdated += items;
                                if( designersupdated === designers.length ){
                                    response.render('message', {
                                        message : "Updated "+ contentupdated + " items",
                                        user: req.user
                                    });
                                }

                            });
                };

            });

    };
    get('/twitter/designers/update', app, auth, updatefromdesigners );

    // Retrieve new designers content.
    var checkdesigners = function(req, response){

        config.getdesigners()
            .then(function( designers ){

                getnewtweets( designers )
                    .then(function( result ){
                        response.render('checknew', {
                            api_name: "Twitter",
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
