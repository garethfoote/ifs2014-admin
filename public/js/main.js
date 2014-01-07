"use strict";
var socket = io.connect('http://localhost'),
classRegExp = function( className ){
    return new RegExp("(?:^|\\s)"+className+"(?!\\S)");
};


function itemClickedHandler( e ){

    var el = e.currentTarget,
        id = el.getAttribute('data-item-id');

    console.log( el, id,  el.className.match( classRegExp('selected') ));
    if( ! el.className.match( classRegExp('selected')) ){;
        el.className = el.className + " selected";
        socket.emit('select', id );
    } else {
        el.className = el.className.replace( classRegExp('selected'), '' );
        socket.emit('deselect', id );
    }

}

var ci = document.querySelectorAll('.content-item');

for( var i=0; i < ci.length; i++ ){

    ci[i].addEventListener("click", itemClickedHandler);

}

