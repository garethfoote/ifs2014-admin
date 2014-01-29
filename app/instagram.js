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
            "caption"
        ],
        toinsert = [],
        i;

    fresh = fresh.value.data;
    existing = existing.value;

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

function getexisting( userid ) {

    var deferred = Q.defer();

    db.collection.find({ ig_user_id : userid }).sort({ created_time : -1 })
        .toArray(function( err, res ){
            if( err != "null" ){
                deferred.resolve( res );
            } else {
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
                getexisting(designer.ig_user_id),
                fetchlatest(designer.ig_user_id)
            ])
            .spread(function(existing, fresh){

                return storenew( existing, fresh, designer );

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
                if( completetotal+failedtotal == designers.length ){
                    deferred.resolve({ insertednum: insertstotal, failednum : failedtotal });
                }

            })
            .fail(function(){

                failedtotal++;
                if( completetotal+failedtotal == designers.length ){
                    deferred.resolve({ insertednum: insertstotal, failednum : failedtotal });
                }

            });
    }

    return deferred.promise;
}

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
            // console.log(hashtagdata[id]);

            db.collection.count({ id : id }, function(err, count) {


                if( count === 0 ){

                    // storenew([], [hashtagdata[id]]);

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

instagram.init = function( app, auth, io ){

    initsockets( io );

    app.get('/instagram/checknew/designers', /*auth.ensureAuth,*/ function(req, response){

        config.getdesigners()
            .then(function( designers ){

                getnewinstagrams( designers )
                    .then(function( result ){
                        response.render('checknew', { user: req, inserts : result.insertednum, failed : result.failednum });

                    });
            })
            .fail(function(err){
                console.log("Error getting designers.json", err);

            });

    });

    app.get('/instagram/checknew/hashtag/:hashtag', /* auth.ensureAuth, */ function(req, response){

        var hashtag = req.params.hashtag;

        fetchhashtag(hashtag)
            .then(function(results){

                var data = results.data;
                for (var i = 0; i < data.length; i++) {
                    hashtagdata[data[i].id] = data[i];
                };

                response.render('contentitems', {
                    user: req.user,
                    contentitem : results.data
                });

            });

    });
};
