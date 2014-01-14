"use strict";
var host = location.origin.replace(/^http/, 'ws'),
    socket = io.connect(host),
    classRegExp = function( className ){
        return new RegExp("(?:^|\\s)"+className+"(?!\\S)");
    };


function itemClickedHandler( e ){

    if( e.target.nodeName.toLowerCase() === "input" ){
        return;
    }

    var el = e.currentTarget.parentNode,
        // type = document.getElementByName("content-item__type"),
        id = el.getAttribute('data-item-id');

    // console.log( el, id,  el.className.match( classRegExp('isselected') ));
    if( ! el.className.match( classRegExp('isselected')) ){;
        el.className = el.className + " isselected";
        socket.emit('select',  id );
    } else {
        el.className = el.className.replace( classRegExp('isselected'), '' );
        socket.emit('select',  id );
    }

}


function handleBlur( e ){

    var el = e.target,
        id = el.getAttribute('data-item-id'),
        value = el.value;

    socket.emit('tags', { id : id, tags : value });

}

$(function(){

    var ci = document.querySelectorAll('.content-item__image'),
        inputs = document.querySelectorAll('.content-item__tags');

    for( var i=0; i < ci.length; i++ ){

        var tags = ci[i].parentNode.querySelector(".content-item__tags");

        ci[i].addEventListener("click", itemClickedHandler);
        tags.addEventListener("blur", handleBlur );

    }

    $(".warning .cta").on("click", function(e){

        var $el = $(e.currentTarget);
        if( $el.hasClass("js-yes") ){
            socket.emit("removeall");
        } else {
            document.location = "/";
        }

    });

});
