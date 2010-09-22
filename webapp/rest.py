# -*- coding: utf-8 -*-

import crud

class IRestRootSection(crud.ISection):
    pass

class VocabSection(crud.Section):

    def get_items_listing(self, request=None):
        """
        Returns a vocab in format {items : [(id, name), (id, name),]}
        """
        items = self.get_items(order_by="name", wrap=False)
        result = [ (item.id, repr(item)) for item in items ]
        return {'items':result}

    def create_new_item(self, params):
        """
        Adds a new item to the collection, then returns
        the full collections and the ID of the new item in the following format:
        { new_id: 123, items: [(id, name), (id, name),] }
        """

        from webapp import DBSession

        new_item = self.create_subitem()
        new_item.name = params['name']
        DBSession.add(new_item)

        result = self.get_items_listing()
        result['new_id'] = new_item.id
        return result

