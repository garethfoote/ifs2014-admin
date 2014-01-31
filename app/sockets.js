var sockets = module.exports,
    twitter = require("./twitter"),
    instagram = require("./instagram"),
    db = require("./db");

sockets.init = function( io ){

    io.sockets.on('connection', function (socket) {

        socket.on('deselect', function (data) {
            console.log("Deselect: " + data.id);
            db.collection.update({ id : data.id, type : data.type },
                        { $set: { selected : false }},
                        function(err, items){
                            console.log(err, items);
                        });

        });

        socket.on('select', function (data) {
            console.log("Select: " + data.id, data.type );

            db.collection.count({
                id : data.id,
                type : data.type
            }, function(err, count) {

                console.log("Count", count);
                // New.
                if( count === 0 ){

                    console.log("Insert", data.type);
                    if( data.type === "twitter" ){
                        twitter.insertselected( data.id );
                    } else {
                        instagram.insertselected( data.id );
                    }

                } else {

                    db.collection.update({ id : data.id, type : data.type },
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

        /* Hopefully no longer needed.
        socket.on('removeall', function (data) {

            db.collection.remove(function(err, result) {
                            console.log("Remove callback", err, result);
                        });

        });
        */

    });
}
