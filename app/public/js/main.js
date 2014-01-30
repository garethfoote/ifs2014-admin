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
        id = el.getAttribute('data-item-id');

    if( ! el.className.match( classRegExp('isselected')) ){;
        el.className = el.className + " isselected";
        socket.emit('select',  id );
    } else {
        el.className = el.className.replace( classRegExp('isselected'), '' );
        socket.emit('deselect',  id );
    }

}


function handleBlur( e ){

    var el = e.target,
        id = el.getAttribute('data-item-id'),
        value = el.value;

    if( ! hasClass(el,"content-item__tags") ){
        socket.emit('caption', { id : id, caption : value });
    } else {
        socket.emit('tags', { id : id, tags : value });
    }

}

function hasClass(ele,cls) {
        return ele.className.match(new RegExp('(\\s|^)'+cls+'(\\s|$)'));
}

$(function(){

    var ci = $('.content-item'),
        img, tags, caption;

    for( var i=0; i < ci.length; i++ ){

        img = $(".content-item__image", ci[i]);
        tags = $(".content-item__tags", ci[i]);
        caption = $(".content-item__caption", ci[i]);

        $(img).on("click", itemClickedHandler);
        $(tags).on("click", handleBlur);
        $(caption).on("click", handleBlur);

    }

    $(".warning .cta").on("click", function(e){

        var $el = $(e.currentTarget);
        if( $el.hasClass("js-yes") ){
            socket.emit("removeall");
            setTimeout(function(){
                document.location = "/";
            },1000);
        } else {
            document.location = "/";
        }
    });

    $(".js-addhash").on("click", function(e){

        var href = $(e.currentTarget).data("href"),
            hashtag = $(".js-hashtag").val();

        e.preventDefault();

        if( hashtag ){
            document.location = href + hashtag;
        }

    });

});
