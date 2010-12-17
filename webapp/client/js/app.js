
// Create a closed memory space for the application definition and instantiation.
// This way, we keep the global name space clean.
(function( $ ){

	// I am the class that controls the Javascript framework.
	function Application(){

        var self = this;
		// I am the collection of route mappings that map URL patterns to event
		// handlers within the cached controllers.
		this.routeMappings = [];

		// I am the collection of controllers. All controllers are intended to be
		// singleton instances.
		this.controllers = [];

		// I am the collection of models. I can contain either cached singleton
		// instances or class definitions (to be instantiated at request).
		this.models = {
			cache: {},
			classes: {}
		};

		// I am the collection of views. I can contain either cached singleton
		// instances of class definitions (to be instantiated at request).
		this.views = {
			cache: {},
			classes: {}
		};

        /// validation rules to be used with forms
        this.validation_rules = {
        };

        /// a "Page not found" view - displayed when a page is not found
        self.pageNotFoundView = new GenericView({identifier:"404"});

		this.isRunning = false;

        this.visitedUrlsLog = [];

        this.showMessage = function(msg, title) {
            /*
            Displays a message - a nicer replacement for
            alert function
            */
            $('<div></div>').html(msg).dialog({
                modal: true,
                title:title,
                buttons: {
                    Ok: function() {
                        $(this).dialog('close');
                    }
                }
            });
        }

        /* The code above is executed before the DOM is loaded so we need to
           postpone registering the error handlers until later
        */
        $(function() {
            /// Ajax spinner
            $("body").append($('<div id="ajax-spinner">&nbsp;</div>'));
            $('#ajax-spinner').ajaxStart(function () {
                $(this).show();
            });
            $('#ajax-spinner').ajaxStop(function () {
                $(this).hide();
            });
            /// Error message box
            $("#ajax-error").ajaxError(function(event, xhr, ajaxOptions, thrownError) {
                var self = this;
                $(self).html(xhr.responseText).dialog({
                        modal: true,
                        buttons: {
                            Ok: function() {
                                $(this).dialog('close');
                            }
                        }
                    });
            });

        });

        /// TODO: Not sure it belongs here
        $.fn.serializeObject = function()
        {
            /// This creates a custom function which
            /// serializes a form into an object which
            /// can easily be converted to JSON representation
            /// TODO: not sure how robust this is with multiple values
            /// See http://stackoverflow.com/questions/1184624/serialize-form-to-json-with-jquery
            var o = {};
            var a = this.serializeArray();
            $.each(a, function() {
                if (o[this.name]) {
                    if (!o[this.name].push) {
                        o[this.name] = [o[this.name]];
                    }
                    o[this.name].push(this.value || '');
                } else {
                    o[this.name] = this.value || '';
                }
            });
            return o;
        };

	};


	// I add a given class to the given cache or class repository.
	Application.prototype.addClass = function( target, value ){
		// Get the constructor of our value class.
		var constructor = value.constructor;

		// Check to see if this constructor is the Function object. If it is,
		// then this is just a class, not an instance.
		if (constructor == Function){

			// This value object is a class, not an instance. Therefore, we need
			// to get the name of the class from the function itself.
			var className = value.toString().match( new RegExp( "^function\\s+([^\\s\\(]+)", "i" ) )[ 1 ];

			// Cache the class constructor.
			target.classes[ className ] = value;

            this.log("1. Caching "+className);
		} else {

			// This value object is an actual instance of the given class. Therefore,
			// we need to get the name of the class from its constructor function.
			var className = value.constructor.toString().match( new RegExp( "^function\\s+([^\\s\\(]+)", "i" ) )[ 1 ];


			// Cache the class constructor.
			target.classes[ className ] = value.constructor;

            this.log("2. Caching "+className+" = "+value.constructor);
			// In addition to caching the class constructor, let's cache this instance
			// of the given class itself (as it will act as a singleton).
			target.cache[ className ] = value;

			// Check to see if the application is running. If it is, then we need to initialize
			// the singleton instance.
			if (this.isRunning){
				this.initClass( value );
			}

		}
	};


	// I add the given controller to the collection of controllers.
	Application.prototype.addController = function( controller ){
		// Add the controller.
		this.controllers.push( controller );

		// Check to see if the application is running. If it is, then we need to initialize
		// the controller instance.
		if (this.isRunning){
			this.initClass( controller );
		}
	};

    Application.prototype.addValidationRules = function(name, rule) {
        this.validation_rules[name] = rule;
    }

    Application.prototype.getValidationRules = function(name) {
        return this.validation_rules[name];
    }

	// I add the given model class or instance to the model class library. Any classes
	// that are passed in AS instances will be cached and act as singletons.
	Application.prototype.addModel = function( model ){
		this.addClass( this.models, model );
	};


	// I add the given view class or instance to the view class library. Any classes
	// that are passed in AS instances will be cached and act as singletons.
	Application.prototype.addView = function( name, view ){
		//this.addClass( this.views, view );
        this.log("Adding "+ view + " as "+name);
        this.views[name] = view;
	};


	// I provide an AJAX gateway to the server.
	Application.prototype.ajax = function( options ){
		var self = this;

		// Get the full range of settings.
		var ajaxOptions = $.extend(
			{
				type: "get",
				dataType: "json",
				normalizeJSON: false,
				cache: false,
				timeout: (10 * 1000),
				success: function( response, statusText ){},
				error: function( request, statusText, error ){
					alert( "There was a critical error communicating with the server" );
				},
				complete: function( request, statusText ){}
			},
			options
		);

		// If the data type is JSON, override the success method with one that
		// will normalize the response first.
		if (
			ajaxOptions.normalizeJSON &&
			(ajaxOptions.dataType == "json") &&
			options.success
			){

			var targetSuccess = options.success;

			// Proxy the success callback, normalizing the response.
			ajaxOptions.success = function( response, statusText ){
				targetSuccess( self.normalizeJSON( response ) );
			};
		}

		// Make the AJAX call.
		$.ajax( ajaxOptions );
	};


	// I return an instance of the class with the given name from the given target.
	Application.prototype.getClass = function( target, className, initArguments ){
		// Check to see if the instance is a cached singleton.
		if (target.cache[ className ]){

			// This is a cached class - return the singleton.
			return( target.cache[ className ] );

		} else {

			// This is not a cached class - return a new instance. In order to
			// do that, we will have to create an instance of it and then
			// initialize it with the given arguments.
            this.log("Resolving "+ className);
			var newInstance = new (target.classes[ className ])();

			// Initialize the class, this time calling the constructor in the
			// context of the class instance.
			target.classes[ className ].apply( newInstance, initArguments );

			// Return the new instance.
			return( newInstance );

		}
	};


	// I return an instance of the class with the given name.
	Application.prototype.getModel = function( className, initArguments ){
		return( this.getClass( this.models, className, initArguments ) );
	};


	// I return an instance of the class with the given name.
	Application.prototype.getView = function( name, initArguments ){
		//return( this.getClass( this.views, className, initArguments ) );
        this.log("Asked for "+name+", found "+name)
        return this.views[name];
	};


	// I initialize the given class instance.
	Application.prototype.initClass = function( instance ){
		// Check to see if the target instance has an init method.
		if (instance.init){
			// Invoke the init method.
			instance.init();
		}
	};


	// I intialize the given collection of class singletons.
	Application.prototype.initClasses = function( classes ){
		var self = this;

		// Loop over the given class collection - our singletons - and init them.
		$.each(
			classes,
			function( index, instance ){
				self.initClass( instance );
			}
		);
	};


	// I intialize the controllers. Once the application starts running and the
	// DOM can be interacted with, I need to give the controllers a chance to
	// get ready.
	Application.prototype.initControllers = function(){
		this.initClasses( this.controllers );
	};


	// I intialize the model. Once the application starts running and the
	// DOM can be interacted with, I need to give the model a chance to
	// get ready.
	Application.prototype.initModels = function(){
		this.initClasses( this.models.cache );
	};


	// I intialize the views. Once the application starts running and the
	// DOM can be interacted with, I need to give the views a chance to
	// get ready.
	Application.prototype.initViews = function(){
        var self = this;
        $.each(
            self.views,
            function( name, view ){
                if (view.init){
                    view.init();
                }
            }
        );

        self.pageNotFoundView.init();


	};


	// I am the logging method that will work cross-browser, if there is a
	// console or not. If no console is avilable, output simply gets appended
	// to the body of the page (in paragraph tags).
	Application.prototype.log = function(){
		// Check to see if there is a console to log to.
		if (window.console && window.console.log){

			// Use the built-in logger.
			window.console.log.apply( window.console, arguments );

		} else {

			// Output the page using P tags.
			/*$.each(
				arguments,
				function( index, value ){
					$( document.body ).append( "<p>" + value.toString() + "</p>" );
				}
			);*/

		}
	};


	// I normalize a hash value for comparison.
	Application.prototype.normalizeHash = function( hash ){
		// Strip off front hash and slashses as well as trailing slash. This will
		// convert hash values like "#/section/" into "section".
		return(
			hash.replace( new RegExp( "^[#/]+|/$", "g" ), "" )
		);
	};


	// I normalize a JSON response from an AJAX call. This is because some languages
	// (such as ColdFusion) are not case sensitive and do not have proper casing
	// on their JSON translations. I will lowercase all keys.
	Application.prototype.normalizeJSON = function( object ){
		var self = this;

		// Check to see if this is an object that can be normalized.
		if (
			(typeof( object ) == "boolean") ||
			(typeof( object ) == "string") ||
			(typeof( object ) == "number") ||
			$.isFunction( object )
			){

			// This is a non-object, just return it's value.
			return( object );
		}

		// Check to see if this is an array.
		if ($.isArray( object )){

			// Create an array into which the normalized data will be stored.
			var normalizedObject = [];

			// Loop over the array value and moralize it's value.
			$.each(
				object,
				function( index, value ){
					normalizedObject[ index ] = self.normalizeJSON( value );
				}
			);

		} else {

			// Create an object into which the normalized data will be stored.
			var normalizedObject = {};

			// Loop over the object key and moralize it's key and value.
			$.each(
				object,
				function( key, value ){
					normalizedObject[ key.toLowerCase() ] = self.normalizeJSON( value );
				}
			);

		}

		// Return the normalized object.
		return( normalizedObject );
	};


    $.address.change( function( event ){
        /*
        Find a route which matches the URL hash we've given and show the view
        which is registered for that route
        */
		var self = window.application;

        var hash = self.normalizeHash(event.value);

        // remember the url
        self.visitedUrlsLog.push(hash);

        // Define the default event context.
        var eventContext = {
            application: self,
            toLocation: hash,
            parameters: new Object(), /// to be filled from the matching route
        };

		// Iterate over the route mappings.
        // Using a for loop here is much cleaner then using JQuery's $.each
		for (var i = 0; i < self.routeMappings.length; i++)
        {
            mapping = self.routeMappings[i];
            self.log("Hash: " + hash + " test: " + mapping.test);
            var matches = null;

            // Get the matches from the location (if the route mapping does
            // not match, this will return null) and check to see if this route
            // mapping applies to the current location (if no matches are returned,
            // matches array will be null).
            if (matches = hash.match( mapping.test )){
                self.log("MATCH: "+matches);
                // The route mapping will handle this location change. Now, we
                // need to prepare the event context and invoke the route handler.

                // Remove the first array (the entire location match). This is
                // irrelevant information. What we want are the captured groups
                // which will be in the subsequent indices.
                matches.shift();



                /// push the default parameters into the parameters dict
                if (mapping.default_parameters)
                {
                    $.each(
                        mapping.default_parameters,
                        function( index, value ){
                            eventContext.parameters[ index ] = value;
                        }
                    );
                }

                // Map the captured group matches to the ordered parameters defined
                // in the route mapping.
                $.each(
                    matches,
                    function( index, value ){
                        eventContext.parameters[ mapping.parameters[ index ] ] = value;
                    }
                );


                mapping.controller.showView(mapping.view, eventContext);


                // Check to see if this controller has a post-handler.
                if (mapping.controller.afterViewShown){
                    // Execute the post-handler.
                    mapping.controller.afterViewShown( eventContext );
                }

                // The view has been found, try no further
                self.log("Returning!");
                return;
            }
        }

        /// If we arrived here then no route was found; display a 404 message
        self.controllers[0].showView(self.pageNotFoundView);
	});


/*	// I create a proxy for the callback so that given callback executes in the
	// context of the application object, overriding any context provided by the
	// calling context.
	Application.prototype.proxyCallback = function( callback ){
		var self = this;

		// Return a proxy that will apply the callback in the THIS context.
		return(
			function(){
				return( callback.apply( self, arguments ) );
			}
		);
	}
*/

    /*
     * Relocates the application to the given location.
     * Don't do anything explicitly -
     * let the location monitoring handle the change implicitly.
     * (hint: location may change without calling this function,
     * for example by clicking on a link
     */

	Application.prototype.relocateTo = function( location ){

        // Clear the location.
        location = this.normalizeHash( location );

        // Change the location
        window.location.hash = ("#/" + location );

	};

    // uses window.application.visitedUrlsLog
    // to return the previous page url
    Application.prototype.previousPageUrl = function() {
        var l = this.visitedUrlsLog;
        var result = "";
        if (l.length > 1) {
            result = l[l.length - 2];
        }
        window.application.log("PREV PAGE: "+ result);
        return result;
    };

	// I start the application.
	Application.prototype.run = function(){
		// Initialize the model.
		this.initModels();

		// Initialize the views.
		this.initViews();

		// Initialize the controllers.
		this.initControllers();

		// Initialize the location monitor.
		//this.initLocationMonitor();

		// Turn on location monitor.
		//this.startLocationMonitor();

		// Flag that the application is running.
		this.isRunning = true;
	};


	// ----------------------------------------------------------------------- //
	// ----------------------------------------------------------------------- //

	// I am the prototype for the application controllers. This is so they
	// can leverage some binding magic without the overhead of the implimentation.
	Application.prototype.Controller = function(){
		// ...
	};


	// I am the prototype for the Controller prototype.
	Application.prototype.Controller.prototype = {

		// I route the given pseudo location to the given controller method.
		route: function( path, view, default_parameters ){

            // Do not allow to add an undefined view:
            if (!view) {
                window.application.showMessage("Undefined view for path "+path,
                                               "Invalid Route");
            }

			// Strip of any trailing and leading slashes.
			path = application.normalizeHash( path );

			// We will need to extract the parameters into an array - these will be used
			// to create the event object when the location changes get routed.
			var parameters = [];

			// Extract the parameters and replace with capturing groups at the same
			// time (such that when the pattern is tested, we can map the captured
			// groups to the ordered paramters above.
			var pattern = path.replace(
				new RegExp( "(/):([^/]+)", "gi" ),
				function( $0, $1, $2 ){
					// Add the named parameter.
					parameters.push( $2 );

					// Replace with a capturing group. This captured group will be used
					// to create a named parameter if this route gets matched.
					return( $1 + "([^/]+)" );
				}
				);

            // window.application.log("Pattern for "+path+" == "+pattern+" => "+parameters);
			// Now that we have our parameters and our test pattern, we can create our
			// route mapping (which will be used by the application to match location
			// changes to controllers).
			application.routeMappings.push({
				controller: this,
				parameters: parameters,
				test: new RegExp( ("^" + pattern + "$"), "i" ),
				view : view,
                default_parameters : default_parameters,
			});
		},

        showView : function( view, event ){

            view.controller = this;


            if (event) {
                parameters = event.parameters;
            } else {
                parameters = undefined;
            }

            // hide the current view
            if (this.currentView && this.currentView.hideView){
                this.currentView.hideView();
            }

            /// Do the initial view set-up before the first showing.
            /// Allows us, say, to load the view contents on demand
            if (!view.alreadyInitialized && view.showViewFirstTime)
            {
                window.application.log("Before fist showing!")
                view.showViewFirstTime(parameters);
                view.alreadyInitialized = true;
            } else {

                // Show the given view.
                view.showView( parameters );
            }

            // Store the given view as the current view.
            this.currentView = view;

            // just logging - delete later
            if (parameters)
            {
                $.each(parameters, function(idx, value) {
                    window.application.log("PARAMETER: "+idx+"->"+value);
                });
            }



            // TODO: reflect the change in the navigation
        }


	};


	// ----------------------------------------------------------------------- //
	// ----------------------------------------------------------------------- //


	// Create a new instance of the application and store it in the window.
	window.application = new Application();

	// When the DOM is ready, run the application.
	$(function(){
		window.application.run();
	});

	// Return a new application instance.
	return( window.application );

})( jQuery );

/*
 // http://www.crockford.com/javascript/inheritance.html

Function.prototype.method = function (name, func) {
    this.prototype[name] = func;
    return this;
};

Function.method('inherits', function (parent) {
    var d = {}, p = (this.prototype = new parent());
    this.method('uber', function uber(name) {
        if (!(name in d)) {
            d[name] = 0;
        }
        var f, r, t = d[name], v = parent.prototype;
        if (t) {
            while (t) {
                v = v.constructor.prototype;
                t -= 1;
            }
            f = v[name];
        } else {
            f = p[name];
            if (f == this[name]) {
                f = v[name];
            }
        }
        d[name] += 1;
        r = f.apply(this, Array.prototype.slice.apply(arguments, [1]));
        d[name] -= 1;
        return r;
    });
    return this;
});

Function.method('swiss', function (parent) {
    for (var i = 1; i < arguments.length; i += 1) {
        var name = arguments[i];
        this.prototype[name] = parent.prototype[name];
    }
    return this;
});

*/