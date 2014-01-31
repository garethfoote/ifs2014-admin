var instagram = module.exports,
    config = require("./config"),
    https = require('https'),
    cors = require('cors'),
    Q = require('q'),
    db = require("./db");

var hashtagdata = {};

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
            "selected"
        ],
        toinsert = [],
        i;

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
            // Add ig_user_id here to makequerying eaiser.
            for(var key in designer ){
                fresh[i][key] = designer[key];
            }
        }
        fresh[i].type = "instagram";
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

function fetchlatest( userid ){

    // Instagram API methods.
    var options = {
        host: 'api.instagram.com',
        port: 443,
        path: '/v1/users/{ig_user_id}/media/recent/?client_id='
              + config.instagramclientid,
        method: 'GET'
    };

    options.path = options.path.replace(/{ig_user_id}/, userid);

    return makerequest( options );

}

function makerequest( options ){

    var deferred = Q.defer();

    var req = https.request(options, function(res) {
        // console.log("statusCode: ", res.statusCode);
        // console.log("headers: ", res.statusCode);

        var result = "";

        res.on('data', function(d) {
            result += d;
        });
        res.on('end', function () {
            if( res.statusCode != "200" ){
                deferred.reject(new Error("Error getting instagram feed. Status code:"+result));
            } else {
                deferred.resolve( JSON.parse(result) );
            }
        });
    });
    req.end();

    req.on('error', function(e) {
        console.error("Get IGRAM error:", e);
        deferred.reject(new Error("Get IGRAM error:" + e));
    });

    return deferred.promise;

}

function getexisting( query ) {

    var deferred = Q.defer();
    query.type = "instagram";

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

    db.connect().then(function(){

        Q.allSettled([
                getexisting({ ig_user_id : designer.ig_user_id }),
                fetchlatest(designer.ig_user_id)
            ])
            .spread(function(existing, fresh){

                return storenew( existing.value, fresh.value.data, designer );

            })
            .then(function( inserted ){
                console.log("Inserted ", inserted, " for ", designer.name);
                deferred.resolve( inserted );

            })
            .fail(function(){

                deferred.reject();

            });

    });

    return deferred.promise;
}

function getnewinstagrams( designers ){

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


function get( route, app, auth, action ){

    var doAuth = false;

    if( doAuth === true ){
        app.get(route, auth.ensureAuth, action);
    } else {
        app.get(route, action);
    }

}

instagram.insertselected = function( id ){

    console.log("insertselected()", id, hashtagdata.hasOwnProperty(id));
    var data = hashtagdata[id];

    data.selected = true;

    storenew([], [data]);

}

instagram.init = function( app, auth, io ){

    // Links to other routes.
    var instagramhome = function(req, response){

        config.getdesigners()
            .then(function(designers){

                response.render('instagram', {
                    user: req.user,
                    designers : designers
                });

            });
    };
    get('/instagram', app, auth, instagramhome );

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
                    var userid = String(designers[i].ig_user_id),
                        set = {}, key;

                    // Create "set" object for update.
                    for (var j = 0; j < allowedkeys.length; j++) {
                        key = allowedkeys[j];
                        set[key] = designers[i][key];
                    };

                    db.collection.update({ "user.id" : userid },
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
    get('/designers/update', app, auth, updatefromdesigners );

    var setalltype = function(req, response){

        db.collection.update({ type : { $ne : "instagram" }},
                    { $set: { type : "instagram" }},
                    { multi : true },
                    function(err, items){
                        response.render('message', {
                            message : "Updated:"+ items,
                            user: req.user
                        });
                    });

    };
    get('/instagram/setalltype', app, auth, setalltype );

    // Select single designer by id.
    var selectdesigner = function(req, response){

        var designerid = req.params.designerid,
            query = { "user.id" : String( designerid ) };

        getexisting(query)
            .then(function(results){
                response.render('contentitems', {
                    contentitem : results, user: req.user
                });
            });

    };
    get('/instagram/select/designer/:designerid', app, auth, selectdesigner );

    // Show all designers.
    var selectdesigners = function(req, response){

        config.getdesigners()
            .then(function( designers ){

                var userids = [];
                for (var i = 0; i < designers.length; i++) {
                    userids.push(String(designers[i].ig_user_id));
                };

                var query = {
                    "user.id" : { $in : userids }
                };

                getexisting(query)
                    .then(function(results){
                        response.render('contentitems', {
                            contentitem : results, user: req.user
                        });
                    });

            });

    };
    get('/instagram/select/designers', app, auth, selectdesigners );

    var selecthashtag = function(req, response){

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
                    existing[i].type = "instagram";
                };

                // Store fresh for possible insertion.
                for (var j = 0; j < fresh.length; j++) {
                    var freshid = fresh[j].id;
                    hashtagdata[freshid] = fresh[j];
                    hashtagdata[freshid].type = "instagram";

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
    get('/instagram/select/hashtag/:hashtag', app, auth, selecthashtag );

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
    get('/instagram/selected', app, auth, showselected );

    // Retrieve new designers content.
    var checkdesigners = function(req, response){

        config.getdesigners()
            .then(function( designers ){

                getnewinstagrams( designers )
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
    get('/instagram/checknew/designers', app, auth, checkdesigners );

};
