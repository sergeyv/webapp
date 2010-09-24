


function GenericView(options){
    this.options = $.extend({}, options);
    return this;
};


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
