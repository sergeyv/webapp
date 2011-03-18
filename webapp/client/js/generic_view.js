


function GenericView(options){
    this.options = $.extend({}, options);
    return this;
};


GenericView.prototype.getRestServiceUrl = function() {
    /*
     * Finds and replaces placeholders in the rest_service_root
     * options parameters with the actual values from the 'event.parameters' dict
     * so if we have a view registered at /companies/:company_id/staff/:person_id, and its rest_service_root is
     * /rest/companies/:company_id/:person_id, the view will load its data from /rest/companies/123/456
     */
    var self = this;
    var root = self.options.rest_service_root;

    /* Not every view needs to load data */
    if (! root) { return "" };

    var url = root.replace(
        new RegExp( "(/):([^/]+)", "gi" ),
        function( $0, $1, $2 ){
            var repl = self.event.parameters[$2];
            if (repl) {
                return "/"+repl;
            }
            return "";
        }
        );

    return url;
}


GenericView.prototype.init = function(){
    /// this is called _before_ the view is loaded
    /// (as the view is loaded on demand)
    /// so the html stuff is not available yet
    var self = this;
    self.view = $( "#"+self.options.identifier+"-view" );
    if (!self.view.length)
    {
        window.application.log("Can't find a node for #"+self.options.identifier+"-view, creating a new one");
        /// Create and append a node if not found
        var nodeId = self.options.identifier+'-view';
        var $node = ($('<div id="'+nodeId+'" class="contentView">'));

        $("#content-views").append($node);
        self.view = $( "#"+nodeId );

        if (self.decorateView) self.decorateView();
    }
};


GenericView.prototype.hideView = function(){
    this.view.removeClass( "activeContentView" );
};

GenericView.prototype.showView = function(){
    this.view.addClass( "activeContentView" );
};


/*
 * RedirectView - redirects to another url when invoked
 */

function RedirectView(target_url){
    this.target_url = target_url;
    return this;

};


RedirectView.prototype.hideView = function(){
    // Nothing to do
};

RedirectView.prototype.showView = function(){
    window.application.log("Redirecting to "+this.target_url);
    window.application.relocateTo(this.target_url);
};
