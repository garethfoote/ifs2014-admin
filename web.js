var express = require('express'),
    app = express(),
    hbs = require('hbs'),
    https = require('https'),
    Q = require('q'),
    fs = require('fs'),
    cors = require('cors');
    // Db = require('tingodb')().Db;

var MongoClient = require('mongodb').MongoClient;

var server = app.listen(process.env.PORT || 5000);
var io = require('socket.io').listen(server);
var igramcollection;
var designers;

var mongoURI = process.env.MONGOLAB_URI ||
  process.env.MONGOHQ_URL ||
    'mongodb://127.0.0.1:27017/ifs2014';

MongoClient.connect(mongoURI, function(err, db) {
    if(err) throw err;

    db.collection("instagrams", function(err, res){
        igramcollection = res;
    });

});

/* UNUSED - Moved to mongodb from tingodb
var db = new Db('data', {});
var igramcollection = db.collection("ifs2014_instagrams_001", function(err, res){
    console.log("Collection opened");
});
*/

function getRecentInstagram( designer ){

    var deferred = Q.defer();

    // https://api.instagram.com/v1/users/1322341/media/recent/?client_id=efacd9d0e5844e73bb75f3f2b0ddf675
    // Instagram API methods.
    var options = {
        host: 'api.instagram.com',
        port: 443,
        path: '/v1/users/{user_id}/media/recent/?client_id=efacd9d0e5844e73bb75f3f2b0ddf675',
        method: 'GET'
    };

    options.path = options.path.replace(/{user_id}/, designer.user_id);
    console.log("Get recent Instagrams: "+ options.path);

    var req = https.request(options, function(res) {
        console.log("statusCode: ", res.statusCode);
        // console.log("headers: ", res.headers);

        var result = "";

        res.on('data', function(d) {
            result += d;
        });
        res.on('end', function () {
            var parsed = JSON.parse(result);
            deferred.resolve({ results : parsed, designer : designer });
        });
    });
    req.end();

    req.on('error', function(e) {
          console.error(e);
          deferred.reject(new Error(error));
    });

    return deferred.promise;
}

function getExistingData( results ) {

    var deferred = Q.defer();

    igramcollection.find({ user_id : results.designer.user_id }).sort({ created_time : -1 })
        .toArray(function( err, res ){
            console.log("found", err);
            if( err != "null" ){
                deferred.resolve( { existing: res, fresh : results.results.data, designer : results.designer });
            } else {
                deferred.reject(new Error(err));
            }

        });

    return deferred.promise;

}

function parseInstagramData( data ) {

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
            "country"
        ],
        existing = data.existing,
        fresh = data.fresh,
        designer = data.designer,
        toinsert = [],
        i = fresh.length;


    // Clean data of unwanted key:vals.
    while( i-- ){
        for(var key in fresh[i]){
            if( keylist.indexOf( key ) < 0 ){
                delete fresh[i][key]
            }
        }
        // Add user_id here to makequerying eaiser.
        for(var key in designer ){
            fresh[i][key] = designer[key];
        }
    }

    // Created array of items to insert.
    i = fresh.length;
    while( i-- ){
        if( ! existing.length || fresh[i].created_time > existing[0].created_time) {
            console.log("insert", fresh[i].created_time);
            toinsert.push( fresh[i] );
        }
    };

    // Do the insert if there are any newies.
    if( toinsert.length > 0 ){
        // Insert all at once rather than one at a time.
        igramcollection.insert( toinsert, {w:1}, function( err, res ){
            if( ! err ){
                deferred.resolve( toinsert.length );
            } else {
                deferred.reject(new Error(err));
            }
        });
    } else {
        setTimeout(function(){
            deferred.resolve(0);
        }, 500);
    }

    return deferred.promise;

}

function getNewInstagrams(){

    var deferred = Q.defer();

    var completenum = 0, insertedtotal = 0;
    for (var i = 0; i < designers.length; i++) {

        igramcollection.update({ user_id : designers[i].user_id },
                    { $set: designers[i] }, { multi : true },
                    function(err, items){
                        console.log("Update designers");
                    });

        getRecentInstagram( designers[i] )
            .then(getExistingData)
            .then(parseInstagramData)
            .then(function( inserted ){

                completenum++;
                insertedtotal += inserted;
                if( completenum == designers.length ){
                    console.log("FINISHED ALL DESIGNERS");
                    deferred.resolve( insertedtotal );
                }

            })
            .fail(function( err ){

                console.log( err );
                deferred.reject(new Error(err));

            });

    };

    return deferred.promise;
}

// Configuration.
app.set('view engine', 'html');
app.engine('html', hbs.__express);
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// Routes.
app.get('/', function(req, response){

    igramcollection.find().sort({ created_time : -1 })
        .toArray(function( err, results ){
            response.render('contentitems', { contentitem : results } );
        });
});

app.get('/checknew', function(req, response){

    getNewInstagrams()
        .then(function(insertednum){
            response.render('checknew', { inserts : insertednum } );
        });

});

app.get('/output.json', function(req, response){

    igramcollection.find({ selected : true }).sort({ created_time : -1 })
        .toArray(function( err, results ){
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(results));
        });

});

// Get designers file on startup.
var file = __dirname + '/designers.json';
fs.readFile(file, 'utf8', function (err, data) {
    if (err) {
        console.log('Error: ' + err);
        return;
    }
    designers = JSON.parse(data);
});

// sockets
io.sockets.on('connection', function (socket) {

    socket.on('deselect', function (id) {
        console.log("Deselect: " + id);
        igramcollection.update({ id : id },
                    { $set: { selected : false }},
                    function(err, items){
                        console.log(err, items);
                    });

    });

    socket.on('select', function (id) {
        console.log("Select: " + id);
        igramcollection.update({ id : id },
                    { $set: { selected : true }},
                    function(err, items){
                        console.log(err, items);
                    });
    });

    socket.on('tags', function (data) {
        console.log("Select: " + data.id);

        var tags = [];
        data.tags.split(",").forEach(function(tag){
            console.log(tag.trim(),tag.trim().match(/^[a-zA-Z0-9_]*$/));
            if( tag.trim() && tag.trim().match(/^[a-zA-Z0-9_]*$/)){
                console.log("passed");
                tags.push(tag.trim());
            }
        });

        if( tags.length ){
            igramcollection.update({ id : data.id },
                    { $set: { custom_tags : tags }},
                    function(err, items){
                        console.log("Updated tags", err, items);
                    });
        }
    });

});
