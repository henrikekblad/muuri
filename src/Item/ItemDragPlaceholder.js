/**
 * Copyright (c) 2018-present, Haltu Oy
 * Released under the MIT license
 * https://github.com/haltu/muuri/blob/master/LICENSE.md
 */

import { addPlaceholderTick, cancelPlaceholderTick } from '../ticker';

import { eventBeforeSend, eventDragReleaseEnd, eventLayoutStart, eventHideStart } from '../shared';

import ItemAnimate from '../Item/ItemAnimate';

import addClass from '../utils/addClass';
import getTranslateString from '../utils/getTranslateString';
import getTranslate from '../utils/getTranslate';
import isFunction from '../utils/isFunction';
import setStyles from '../utils/setStyles';
import removeClass from '../utils/removeClass';
import transformProp from '../utils/transformProp';

/**
 * Drag placeholder.
 *
 * @class
 * @param {Item} item
 */
function ItemDragPlaceholder(item) {
  this._item = item;
  this._animation = new ItemAnimate();
  this._element = null;
  this._className = '';
  this._didMigrate = false;
  this._resetAfterLayout = false;
  this._currentLeft = 0;
  this._currentTop = 0;
  this._nextLeft = 0;
  this._nextTop = 0;

  // Bind animation handlers.
  this._setupAnimation = this._setupAnimation.bind(this);
  this._startAnimation = this._startAnimation.bind(this);

  // Bind event handlers.
  this._onLayoutStart = this._onLayoutStart.bind(this);
  this._onLayoutEnd = this._onLayoutEnd.bind(this);
  this._onReleaseEnd = this._onReleaseEnd.bind(this);
  this._onMigrate = this._onMigrate.bind(this);
  this._onHide = this._onHide.bind(this);
}

/**
 * Private prototype methods
 * *************************
 */

/**
 * Move placeholder to a new position.
 *
 * @private
 * @memberof ItemDragPlaceholder.prototype
 */
ItemDragPlaceholder.prototype._onLayoutStart = function() {
  console.log('onLayoutStart', this._item.isActive());
  var item = this._item;
  var grid = item.getGrid();

  // Find out the item's new (unapplied) left and top position.
  var itemIndex = grid._items.indexOf(item);
  var nextLeft = grid._layout.slots[itemIndex * 2];
  var nextTop = grid._layout.slots[itemIndex * 2 + 1];

  console.log({
    itemIndex,
    isHiding: item.isHiding(),
    isVisible: item.isVisible()
  });

  // If item's position did not change and the item did not migrate we can
  // safely skip layout.
  if (!this._didMigrate && item._left === nextLeft && item._top === nextTop) {
    return;
  }

  // Slots data is calculated with item margins added to them so we need to add
  // item's left and top margin to the slot data to get the placeholder's
  // next position.
  nextLeft += item._marginLeft;
  nextTop += item._marginTop;

  // Just snap to new position without any animations if no animation is
  // required or if placeholder moves between grids.
  var animEnabled = grid._settings.dragPlaceholder.duration > 0;
  if (!animEnabled || this._didMigrate) {
    // Cancel potential (queued) layout tick.
    cancelPlaceholderTick(item._id);

    // Snap placeholder to correct position.
    var targetStyles = {};
    targetStyles[transformProp] = getTranslateString(nextLeft, nextTop);
    setStyles(this._element, targetStyles);
    this._animation.stop(false);

    // Move placeholder inside correct container after migration.
    if (this._didMigrate) {
      grid.getElement().appendChild(this._element);
      this._didMigrate = false;
    }

    return;
  }

  // Start the placeholder's layout animation in the next tick. We do this to
  // avoid layout thrashing.
  this._nextLeft = nextLeft;
  this._nextTop = nextTop;
  addPlaceholderTick(item._id, this._setupAnimation, this._startAnimation);
};

/**
 * Prepare placeholder for layout animation.
 *
 * @private
 * @memberof ItemDragPlaceholder.prototype
 */
ItemDragPlaceholder.prototype._setupAnimation = function() {
  if (!this.isActive()) return;

  console.log('setupAnimation', this._item.isActive());

  var translate = getTranslate(this._element);
  this._currentLeft = translate.x;
  this._currentTop = translate.y;
};

/**
 * Start layout animation.
 *
 * @private
 * @memberof ItemDragPlaceholder.prototype
 */
ItemDragPlaceholder.prototype._startAnimation = function() {
  if (!this.isActive()) return;

  console.log('startAnimation', this._item.isActive());

  var animation = this._animation;
  var currentLeft = this._currentLeft;
  var currentTop = this._currentTop;
  var nextLeft = this._nextLeft;
  var nextTop = this._nextTop;
  var targetStyles = {};

  targetStyles[transformProp] = getTranslateString(nextLeft, nextTop);

  // If placeholder is already in correct position let's just stop animation
  // and be done with it.
  if (currentLeft === nextLeft && currentTop === nextTop) {
    if (animation.isAnimating()) {
      setStyles(this._element, targetStyles);
      animation.stop(false);
    }
    return;
  }

  // Otherwise let's start the animation.
  var settings = this._item.getGrid()._settings.dragPlaceholder;
  var currentStyles = {};
  currentStyles[transformProp] = getTranslateString(currentLeft, currentTop);
  console.log(currentStyles, targetStyles);
  animation.start(currentStyles, targetStyles, {
    duration: settings.duration,
    easing: settings.easing,
    onFinish: this._onLayoutEnd
  });
};

/**
 * Layout end handler.
 *
 * @private
 * @memberof ItemDragPlaceholder.prototype
 */
ItemDragPlaceholder.prototype._onLayoutEnd = function() {
  if (this._resetAfterLayout) {
    this.reset();
  }
};

/**
 * Drag end handler. This handler is called when dragReleaseEnd event is
 * emitted and receives the event data as it's argument.
 *
 * @private
 * @memberof ItemDragPlaceholder.prototype
 * @param {Item} item
 */
ItemDragPlaceholder.prototype._onReleaseEnd = function(item) {
  if (item._id === this._item._id) {
    // If the placeholder is not animating anymore we can safely reset it.
    if (!this._animation.isAnimating()) {
      this.reset();
      return;
    }

    // If the placeholder item is still animating here, let's wait for it to
    // finish it's animation.
    this._resetAfterLayout = true;
  }
};

/**
 * Migration start handler. This handler is called when beforeSend event is
 * emitted and receives the event data as it's argument.
 *
 * @private
 * @memberof ItemDragPlaceholder.prototype
 * @param {Object} data
 * @param {Item} data.item
 * @param {Grid} data.fromGrid
 * @param {Number} data.fromIndex
 * @param {Grid} data.toGrid
 * @param {Number} data.toIndex
 */
ItemDragPlaceholder.prototype._onMigrate = function(data) {
  // Make sure we have a matching item.
  if (data.item !== this._item) return;

  var grid = this._item.getGrid();
  var nextGrid = data.toGrid;

  // Unbind listeners from current grid.
  grid.off(eventDragReleaseEnd, this._onReleaseEnd);
  grid.off(eventLayoutStart, this._onLayoutStart);
  grid.off(eventBeforeSend, this._onMigrate);
  grid.off(eventHideStart, this._onHide);

  // Bind listeners to the next grid.
  nextGrid.on(eventDragReleaseEnd, this._onReleaseEnd);
  nextGrid.on(eventLayoutStart, this._onLayoutStart);
  nextGrid.on(eventBeforeSend, this._onMigrate);
  nextGrid.on(eventHideStart, this._onHide);

  // Mark the item as migrated.
  this._didMigrate = true;
};

/**
 * Reset placeholder if the associated item is hidden.
 *
 * @private
 * @memberof ItemDragPlaceholder.prototype
 * @param {Item[]} items
 */
ItemDragPlaceholder.prototype._onHide = function(items) {
  for (var i = 0; i < items.length; i++) {
    if (items[i]._id === this._item._id) {
      console.log('onHide');
      this.reset();
      return;
    }
  }
};

/**
 * Public prototype methods
 * ************************
 */

/**
 * Create placeholder. Note that this method only writes to DOM and does not
 * read anything from DOM so it should not cause any additional layout
 * thrashing when it's called at the end of the drag start procedure.
 *
 * @public
 * @memberof ItemDragPlaceholder.prototype
 */
ItemDragPlaceholder.prototype.create = function() {
  // If we already have placeholder set up we can skip the initiation logic.
  if (this.isActive()) {
    this._resetAfterLayout = false;
    return;
  }

  var item = this._item;
  var grid = item.getGrid();
  var settings = grid._settings;
  var animation = this._animation;

  // Create placeholder element.
  var element;
  if (isFunction(settings.dragPlaceholder.createElement)) {
    element = settings.dragPlaceholder.createElement(item);
  } else {
    element = window.document.createElement('div');
  }
  this._element = element;

  // Update element to animation instance.
  animation._element = element;

  // Add placeholder class to the placeholder element.
  this._className = settings.itemPlaceholderClass || '';
  if (this._className) {
    addClass(element, this._className);
  }

  // Set initial styles.
  setStyles(element, {
    display: 'block',
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: item._width + 'px',
    height: item._height + 'px'
  });

  // Set initial position.
  var left = item._left + item._marginLeft;
  var top = item._top + item._marginTop;
  element.style[transformProp] = getTranslateString(left, top);

  // Bind event listeners.
  grid.on(eventLayoutStart, this._onLayoutStart);
  grid.on(eventDragReleaseEnd, this._onReleaseEnd);
  grid.on(eventBeforeSend, this._onMigrate);
  grid.on(eventHideStart, this._onHide);

  // onCreate hook.
  if (isFunction(settings.dragPlaceholder.onCreate)) {
    settings.dragPlaceholder.onCreate(item, element);
  }

  // Insert the placeholder element to the grid.
  grid.getElement().appendChild(element);
};

/**
 * Reset placeholder data.
 *
 * @public
 * @memberof ItemDragPlaceholder.prototype
 */
ItemDragPlaceholder.prototype.reset = function() {
  if (!this.isActive()) return;

  var element = this._element;
  var item = this._item;
  var grid = item.getGrid();
  var settings = grid._settings;
  var animation = this._animation;

  // Reset flag.
  this._resetAfterLayout = false;

  // Cancel potential (queued) layout tick.
  cancelPlaceholderTick(item._id);

  // Reset animation instance.
  animation.stop();
  animation._element = null;

  // Unbind event listeners.
  grid.off(eventDragReleaseEnd, this._onReleaseEnd);
  grid.off(eventLayoutStart, this._onLayoutStart);
  grid.off(eventBeforeSend, this._onMigrate);
  grid.off(eventHideStart, this._onHide);

  // Remove placeholder class from the placeholder element.
  if (this._className) {
    removeClass(element, this._className);
    this._className = '';
  }

  // Remove element.
  element.parentNode.removeChild(element);
  this._element = null;

  // onRemove hook. Note that here we use the current grid's onRemove callback
  // so if the item has migrated during drag the onRemove method will not be
  // the originating grid's method.
  if (isFunction(settings.dragPlaceholder.onRemove)) {
    settings.dragPlaceholder.onRemove(item, element);
  }
};

/**
 * Update placeholder's dimensions.
 *
 * @public
 * @memberof ItemDragPlaceholder.prototype
 * @param {Number} width
 * @param {height} height
 */
ItemDragPlaceholder.prototype.updateDimensions = function(width, height) {
  if (this.isActive()) {
    setStyles(this._element, {
      width: width + 'px',
      height: height + 'px'
    });
  }
};

/**
 * Check if placeholder is currently active (visible).
 *
 * @public
 * @memberof ItemDragPlaceholder.prototype
 * @returns {Boolean}
 */
ItemDragPlaceholder.prototype.isActive = function() {
  return !!this._element;
};

/**
 * Destroy placeholder instance.
 *
 * @public
 * @memberof ItemDragPlaceholder.prototype
 */
ItemDragPlaceholder.prototype.destroy = function() {
  this.reset();
  this._animation.destroy();
  this._item = this._animation = null;
};

export default ItemDragPlaceholder;
