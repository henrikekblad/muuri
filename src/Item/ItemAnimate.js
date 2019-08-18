/**
 * Copyright (c) 2015-present, Haltu Oy
 * Released under the MIT license
 * https://github.com/haltu/muuri/blob/master/LICENSE.md
 */

import getCurrentStyles from '../utils/getCurrentStyles';
import getUnprefixedPropName from '../utils/getUnprefixedPropName';
import isFunction from '../utils/isFunction';
import isNative from '../utils/isNative';
import setStyles from '../utils/setStyles';

var Element = window.Element;
var hasWebAnimations = !!(Element && isFunction(Element.prototype.animate));
var hasNativeWebAnimations = !!(Element && isNative(Element.prototype.animate));

/**
 * Item animation handler powered by Web Animations API.
 *
 * @class
 * @param {HTMLElement} element
 */
function ItemAnimate(element) {
  this._element = element;
  this._animation = null;
  this._callback = null;
  this._props = [];
  this._values = [];
  this._isDestroyed = false;
  this._onFinish = this._onFinish.bind(this);
}

/**
 * Public prototype methods
 * ************************
 */

/**
 * Start instance's animation. Automatically stops current animation if it is
 * running.
 *
 * @public
 * @memberof ItemAnimate.prototype
 * @param {Object} propsFrom
 * @param {Object} propsTo
 * @param {Object} [options]
 * @param {Number} [options.duration=300]
 * @param {String} [options.easing='ease']
 * @param {Function} [options.onFinish]
 */
ItemAnimate.prototype.start = function(propsFrom, propsTo, options) {
  if (this._isDestroyed) return;

  var element = this._element;
  var opts = options || {};

  // If we don't have web animations available let's not animate.
  if (!hasWebAnimations) {
    setStyles(element, propsTo);
    this._callback = isFunction(opts.onFinish) ? opts.onFinish : null;
    this._onFinish();
    return;
  }

  var animation = this._animation;
  var currentProps = this._props;
  var currentValues = this._values;
  var cancelAnimation = false;
  var propName, propCount, propIndex;

  // If we have an existing animation running, let's check if it needs to be
  // cancelled or if it can continue running.
  if (animation) {
    propCount = 0;

    // Check if the requested animation target props and values match with the
    // current props and values.
    for (propName in propsTo) {
      ++propCount;
      propIndex = currentProps.indexOf(propName);
      if (propIndex === -1 || propsTo[propName] !== currentValues[propIndex]) {
        cancelAnimation = true;
        break;
      }
    }

    // Check if the target props count matches current props count. This is
    // needed for the edge case scenario where target props contain the same
    // styles as current props, but the current props have some additional
    // props.
    if (!cancelAnimation && propCount !== currentProps.length) {
      cancelAnimation = true;
    }
  }

  // Cancel animation (if required).
  if (cancelAnimation) animation.cancel();

  // Store animation callback.
  this._callback = isFunction(opts.onFinish) ? opts.onFinish : null;

  // If we have a running animation that does not need to be cancelled, let's
  // call it a day here and let it run.
  if (animation && !cancelAnimation) return;

  // Store target props and values to instance.
  currentProps.length = currentValues.length = 0;
  for (propName in propsTo) {
    currentProps.push(propName);
    currentValues.push(propsTo[propName]);
  }

  // Start the animation. We need to provide unprefixed property names to the
  // Web Animations polyfill if it is being used. If we have native Web
  // Animations available we need to provide prefixed properties instead.
  this._animation = animation = element.animate(
    [
      createFrame(propsFrom, !hasNativeWebAnimations),
      createFrame(propsTo, !hasNativeWebAnimations)
    ],
    {
      duration: opts.duration || 300,
      easing: opts.easing || 'ease'
    }
  );
  animation.onfinish = this._onFinish;

  // Set the end styles. This makes sure that the element stays at the end
  // values after animation is finished.
  setStyles(element, propsTo);
};

/**
 * Stop instance's current animation if running.
 *
 * @public
 * @memberof ItemAnimate.prototype
 * @param {Boolean} [applyCurrentStyles=true]
 */
ItemAnimate.prototype.stop = function(applyCurrentStyles) {
  if (this._isDestroyed || !this._animation) return;

  var element = this._element;
  var currentProps = this._props;
  var currentValues = this._values;

  if (applyCurrentStyles !== false) {
    setStyles(element, getCurrentStyles(element, currentProps));
  }

  this._animation.cancel();
  this._animation = this._callback = null;
  currentProps.length = currentValues.length = 0;
};

/**
 * Check if the item is being animated currently.
 *
 * @public
 * @memberof ItemAnimate.prototype
 * @return {Boolean}
 */
ItemAnimate.prototype.isAnimating = function() {
  return !!this._animation;
};

/**
 * Destroy the instance and stop current animation if it is running.
 *
 * @public
 * @memberof ItemAnimate.prototype
 */
ItemAnimate.prototype.destroy = function() {
  if (this._isDestroyed) return;
  this.stop();
  this._element = null;
  this._isDestroyed = true;
};

/**
 * Private prototype methods
 * *************************
 */

/**
 * Animation end handler.
 *
 * @private
 * @memberof ItemAnimate.prototype
 */
ItemAnimate.prototype._onFinish = function() {
  var callback = this._callback;
  this._animation = this._callback = null;
  this._props.length = this._values.length = 0;
  callback && callback();
};

/**
 * Private helpers
 * ***************
 */

function createFrame(props, unprefix) {
  var frame = {};
  for (var prop in props) {
    frame[unprefix ? getUnprefixedPropName(prop) : prop] = props[prop];
  }
  return frame;
}

export default ItemAnimate;
