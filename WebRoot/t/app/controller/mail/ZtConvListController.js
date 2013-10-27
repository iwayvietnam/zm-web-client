/*
 * ***** BEGIN LICENSE BLOCK *****
 * Zimbra Collaboration Suite Web Client
 * Copyright (C) 2012, 2013 Zimbra Software, LLC.
 * 
 * The contents of this file are subject to the Zimbra Public License
 * Version 1.4 ("License"); you may not use this file except in
 * compliance with the License.  You may obtain a copy of the License at
 * http://www.zimbra.com/license.
 * 
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
 * ***** END LICENSE BLOCK *****
 */

/**
 * This class represents a controller that manages a list of conversations.
 *
 * @author Conrad Damon <cdamon@zimbra.com>
 */
Ext.define('ZCS.controller.mail.ZtConvListController', {

	extend: 'ZCS.controller.ZtListController',

	// slight hack to load some needed files early, rather than dynamically loading as needed via an
	// asynchronous request (which introduces timing problems)
	requires: [
		'ZCS.view.mail.ZtMsgListView'
	],

	config: {

		models: ['ZCS.model.mail.ZtConv'],
		stores: ['ZCS.store.mail.ZtConvStore'],

		refs: {
			// event handlers
			listPanel: 'sheet #' + ZCS.constant.APP_MAIL + 'listpanel',
			listView: ZCS.constant.APP_MAIL + 'listview',
			folderList: 'sheet #' + ZCS.constant.APP_MAIL + 'overview nestedlist',
			itemPanel: 'appview #' + ZCS.constant.APP_MAIL + 'itempanel',

			// other
			overview: '#' + ZCS.constant.APP_MAIL + 'overview',
			titlebar: 'sheet #' + ZCS.constant.APP_MAIL + 'listpanel titlebar',
			searchBox: 'sheet #' + ZCS.constant.APP_MAIL + 'listpanel searchfield'
		},

		control: {
			listPanel: {
				newItem: 'doCompose'
			},
			listView: {
				itemswipe: 'handleSwipe',
				initialize: 'setupScrollHandling'
			}
		},

		app: ZCS.constant.APP_MAIL
	},

	launch: function() {

		this.callParent();

		ZCS.app.on('notifyConversationDelete', this.handleDeleteNotification, this);
		ZCS.app.on('notifyConversationCreate', this.handleConvCreateNotification, this);
		ZCS.app.on('notifyMessageCreate', this.handleMsgCreateNotification, this);
		ZCS.app.on('notifyConversationChange', this.handleModifyNotification, this);
	},

	doDelete: function (list, item, target, record) {
		ZCS.app.fireEvent('deleteMailItem', record);
	},

	getDefaultQuery: function() {
		return ZCS.session.getSetting(ZCS.constant.SETTING_INITIAL_SEARCH);
	},

	getItemController: function() {
		return ZCS.app.getConvController();
	},

	doCompose: function() {
		ZCS.app.getComposeController().compose();
	},

	handleSwipe: function(list, index, convItem, record, e, eOpts) {

		var convEl = convItem.element,
			convElBox = convEl.getBox(),
			buttonHeight = convElBox.height,
			buttonWidth = 120,
			swipeElm = Ext.dom.Element.create({
				html: ZCS.controller.mail.ZtConvListController.swipeToDeleteTpl.apply({
					width: buttonWidth,
					height: buttonHeight
				}),
				"class": 'zcs-outer-swipe-elm'
			}),
			dockItem = convEl.down('.x-dock'),
			sameItemSwipeButton = convEl.down('.zcs-outer-swipe-elm'),
			anySwipeButton = list.element.down('.zcs-outer-swipe-elm'),
			anim = Ext.create('Ext.Anim');

		e.preventDefault();

		if (sameItemSwipeButton) {
			sameItemSwipeButton.fadeAway();
		} else {

			if (anySwipeButton && !anySwipeButton.fading) {
				anySwipeButton.fadeAway();
			}

			swipeElm.fadeAway = function () {
				var fadingButton = swipeElm;
				fadingButton.fading = true;
				Ext.Anim.run(fadingButton, 'fade', {
					after: function() {
						fadingButton.destroy();
					},
					out: true
				})
			}

			swipeElm.on('tap', function (event, node, options, eOpts) {
				var el = Ext.fly(event.target);
				if (el.hasCls('zcs-swipe-delete')) {
					ZCS.app.fireEvent('swipeDeleteMailItem', record);
					swipeElm.fadeAway();
					event.stopEvent();
				}
			});

			swipeElm.on('swipe', function () {
				swipeElm.fadeAway();
			});

			//Delay this so any scroll that occurs before a swiper has a chance to complete
			Ext.defer(function () {
				swipeElm.insertAfter(Ext.fly(convEl.dom.children[0]));
			}, 100);

		}
	},

	setupScrollHandling: function (list) {

		//Make sure no delete buttons are hanging around after
		//a data change event or on a scroll
		var scroller = list.getScrollable().getScroller(),
			cleanSwipeButtons = function () {
				var swipeElm = list.element.down('.zcs-outer-swipe-elm');
				if (swipeElm) {
					swipeElm.fadeAway();
				}
			},
			nukeSwipeButtons = function () {
				//Seeing a button fade away from the previous list is weird, destroy is instead.
				var swipeElm = list.element.down('.zcs-outer-swipe-elm');
				if (swipeElm) {
					swipeElm.destroy();
				}
			};

		scroller.on('scrollstart', cleanSwipeButtons);

		list.getStore().on('load', nukeSwipeButtons);
	},

	/**
	 * Handle a newly created conv. Add it to view if any of its messages (which
	 * should have also just been created) are in the currently viewed folder.
	 *
	 * @param {ZtItem}  item        (not passed for create notifications)
	 * @param {Object}  create      JSON create node
	 */
	handleConvCreateNotification: function(item, convCreate) {

		var curFolder = this.getFolder() || ZCS.session.getCurrentSearchOrganizer(),
			curFolderId = curFolder && curFolder.get('zcsId'),
			isOutbound = ZCS.util.isOutboundFolderId(curFolderId),
			creates = convCreate.creates,
			doAdd = false,
			ln = creates && creates.m ? creates.m.length : 0,
			msgCreate, i, addresses, recips, fragment;

		for (i = 0; i < ln; i++) {
			msgCreate = creates.m[i];
			if (msgCreate.cid === convCreate.id && msgCreate.l === curFolderId) {
				doAdd = true;
				if (isOutbound) {
					addresses = ZCS.model.mail.ZtMailItem.convertAddressJsonToModel(msgCreate.e);
					recips = ZCS.mailutil.getSenders(addresses);
					fragment = msgCreate.fr;
				}
				break;
			}
		}

		var reader = ZCS.model.mail.ZtConv.getProxy().getReader(),
			data = reader.getDataFromNode(convCreate),
			store = this.getStore(),
			conv = new ZCS.model.mail.ZtConv(data, convCreate.id);

		if (recips) {
			conv.set('senders', recips);
		}
		conv.set('fragment', conv.get('fragment') || fragment);

		if (doAdd || convCreate.doAdd) {
			store.insert(0, [conv]);
		}
	},

	/**
	 * We only care about a new message if it matches our search and if we have
	 * not seen its conv. For example, a conversation may have one or more messages
	 * in folders other than Inbox (such as Sent), and then receive a message into
	 * Inbox. In that case, we want to create a new conversation and add it to our
	 * list.
	 *
	 * @param {ZtItem}  item        (not passed for create notifications)
	 * @param {Object}  create      JSON create node
	 */
	handleMsgCreateNotification: function(item, msgCreate) {

		var store = this.getStore();

		if (store.getById(msgCreate.cid)) {
			return;
		}

		var curFolder = this.getFolder() || ZCS.session.getCurrentSearchOrganizer(),
			curFolderId = curFolder && curFolder.get('zcsId'),
			convCreate;

		if (msgCreate.l === curFolderId) {
			// virtual conv that got promoted will have convCreateNode
			if (msgCreate.convCreateNode) {
				convCreate = msgCreate.convCreateNode;
				if (convCreate.newId) {
					convCreate.id = convCreate.newId;
					convCreate.doAdd = true;
					this.handleConvCreateNotification(null, convCreate);
				}
			}
			else {
				// create from msg node
				convCreate = {
					id:         msgCreate.cid,
					d:          msgCreate.d,
					e:          Ext.clone(msgCreate.e),
					f:          msgCreate.f,
					fr:         msgCreate.fr,
					itemType:   ZCS.constant.ITEM_CONVERSATION,
					nodeType:   ZCS.constant.NODE_CONVERSATION,
					su:         msgCreate.su,
					doAdd:      true
				};
				this.handleConvCreateNotification(null, convCreate);
			}
		}

	},

	/**
	 * Handle promotion of virtual convs here since we need to interact with the store. Also handle anything
	 * we need a reader for, since we can get at it here.
	 */
	handleModifyNotification: function(item, modify) {

		var store = this.getStore();

		// virtual conv changes ID when it gets a second message; we can't just change the ID
		// field since that breaks the connection to the list item in the UI
		if (modify.newId) {
			var oldConv = ZCS.cache.get(modify.id),
				newConv;

			if (store.getById(oldConv.getId())) {
				newConv = oldConv && oldConv.copy(modify.newId);
				store.remove(oldConv);
				store.insert(0, newConv);   // moves conv to top
				item = newConv;
			}
		}

		// regenerate addresses and senders (the possibly truncated string in the list view)
		if (modify.e) {
			modify.addresses = ZCS.model.mail.ZtMailItem.convertAddressJsonToModel(modify.e);
			modify.senders = ZCS.mailutil.getSenders(modify.addresses);
		}

		// let the conv itself handle the simple stuff
		item.handleModifyNotification(modify);

		//If this item is a draft, go ahead and select it, because the normal ext logic unselects it.
		if (item.data.isDraft) {
			this.getListView().select(item);
		}
	}
},
	function (thisClass) {
		thisClass.swipeToDeleteTpl = Ext.create('Ext.XTemplate', ZCS.template.ConvListSwipeToDelete);
	}
);
