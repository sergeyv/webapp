


function GenericView(dom_id){
    this.view = $( dom_id );
    this.dom_id = dom_id;

    return this;

};


GenericView.prototype.hideView = function(){
    $(this.dom_id).removeClass( "activeContentView" );
};

GenericView.prototype.showView = function(){
    $(this.dom_id).addClass( "activeContentView" );
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
