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

    var el = $(e.currentTarget.parentNode),
        id = el.data('item-id');

    if( ! el.hasClass( 'isselected' ) ){;
        el.addClass("isselected");
        socket.emit('select',  id );
    } else {
        el.removeClass("isselected");
        socket.emit('deselect',  id );
    }

}


function handleBlur( e ){

    var el = $(e.target),
        id = el.data('item-id'),
        value = el.val();

    if( el.hasClass("content-item__tags") ){
        socket.emit('tags', { id : id, tags : value });
    } else {
        socket.emit('caption', { id : id, caption : value });
    }

}

$(function(){

    var ci = $('.content-item'),
        img, tags, caption;

    for( var i=0; i < ci.length; i++ ){

        img = $(".content-item__image", ci[i]);
        tags = $(".content-item__tags", ci[i]);
        caption = $(".content-item__caption", ci[i]);

        $(img).on("click", itemClickedHandler);
        $(tags).on("blur", handleBlur);
        $(caption).on("blur", handleBlur);

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
