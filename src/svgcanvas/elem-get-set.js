/**
 * @module elem-get-set get and set methods.
 * @license MIT
 * @copyright 2011 Jeff Schiller
 */

import { jGraduate } from '../editor/components/jgraduate/jQuery.jGraduate.js'
import { NS } from './namespaces.js'
import {
  getVisibleElements, getStrokedBBoxDefaultVisible, findDefs,
  walkTree, isNullish, getHref, setHref, getElement
} from './utilities.js'
import {
  convertToNum
} from '../common/units.js'
import { getParents } from '../editor/components/jgraduate/Util.js'

let svgCanvas = null

/**
* @function module:elem-get-set.init
* @param {module:elem-get-set.elemContext} elemContext
* @returns {void}
*/
export const init = (canvas) => {
  svgCanvas = canvas
}

/**
* @function module:elem-get-set.SvgCanvas#getResolution
* @returns {DimensionsAndZoom} The current dimensions and zoom level in an object
*/
export const getResolutionMethod = function () {
  const zoom = svgCanvas.getZoom()
  const w = svgCanvas.getSvgContent().getAttribute('width') / zoom
  const h = svgCanvas.getSvgContent().getAttribute('height') / zoom

  return {
    w,
    h,
    zoom
  }
}

/**
* @function module:elem-get-set.SvgCanvas#getTitle
* @param {Element} [elem]
* @returns {string|void} the current group/SVG's title contents or
* `undefined` if no element is passed nd there are no selected elements.
*/
export const getTitleMethod = function (elem) {
  const selectedElements = svgCanvas.getSelectedElements()
  const dataStorage = svgCanvas.getDataStorage()
  elem = elem || selectedElements[0]
  if (!elem) { return undefined }
  if (dataStorage.has(elem, 'gsvg')) {
    elem = dataStorage.get(elem, 'gsvg')
  } else if (dataStorage.has(elem, 'symbol')) {
    elem = dataStorage.get(elem, 'symbol')
  }
  const childs = elem.childNodes
  for (const child of childs) {
    if (child.nodeName === 'title') {
      return child.textContent
    }
  }
  return ''
}

/**
* Sets the group/SVG's title content.
* @function module:elem-get-set.SvgCanvas#setGroupTitle
* @param {string} val
* @todo Combine this with `setDocumentTitle`
* @returns {void}
*/
export const setGroupTitleMethod = function (val) {
  const {
    InsertElementCommand, RemoveElementCommand,
    ChangeElementCommand, BatchCommand
  } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  const dataStorage = svgCanvas.getDataStorage()
  let elem = selectedElements[0]
  if (dataStorage.has(elem, 'gsvg')) {
    elem = dataStorage.get(elem, 'gsvg')
  }

  const ts = elem.querySelectorAll('title')

  const batchCmd = new BatchCommand('Set Label')

  let title
  if (!val.length) {
    // Remove title element
    const tsNextSibling = ts.nextSibling
    batchCmd.addSubCommand(new RemoveElementCommand(ts[0], tsNextSibling, elem))
    ts.remove()
  } else if (ts.length) {
    // Change title contents
    title = ts[0]
    batchCmd.addSubCommand(new ChangeElementCommand(title, { '#text': title.textContent }))
    title.textContent = val
  } else {
    // Add title element
    title = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'title')
    title.textContent = val
    elem.insertBefore(title, elem.firstChild)
    batchCmd.addSubCommand(new InsertElementCommand(title))
  }

  svgCanvas.addCommandToHistory(batchCmd)
}

/**
* Adds/updates a title element for the document with the given name.
* This is an undoable action.
* @function module:elem-get-set.SvgCanvas#setDocumentTitle
* @param {string} newTitle - String with the new title
* @returns {void}
*/
export const setDocumentTitleMethod = function (newTitle) {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const childs = svgCanvas.getSvgContent().childNodes
  let docTitle = false; let oldTitle = ''

  const batchCmd = new BatchCommand('Change Image Title')

  for (const child of childs) {
    if (child.nodeName === 'title') {
      docTitle = child
      oldTitle = docTitle.textContent
      break
    }
  }
  if (!docTitle) {
    docTitle = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'title')
    svgCanvas.getSvgContent().insertBefore(docTitle, svgCanvas.getSvgContent().firstChild)
    // svgContent.firstChild.before(docTitle); // Ok to replace above with this?
  }

  if (newTitle.length) {
    docTitle.textContent = newTitle
  } else {
    // No title given, so element is not necessary
    docTitle.remove()
  }
  batchCmd.addSubCommand(new ChangeElementCommand(docTitle, { '#text': oldTitle }))
  svgCanvas.addCommandToHistory(batchCmd)
}

/**
* Changes the document's dimensions to the given size.
* @function module:elem-get-set.SvgCanvas#setResolution
* @param {Float|"fit"} x - Number with the width of the new dimensions in user units.
* Can also be the string "fit" to indicate "fit to content".
* @param {Float} y - Number with the height of the new dimensions in user units.
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {boolean} Indicates if resolution change was successful.
* It will fail on "fit to content" option with no content to fit to.
*/
export const setResolutionMethod = function (x, y) {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const zoom = svgCanvas.getZoom()
  const res = svgCanvas.getResolution()
  const { w, h } = res
  let batchCmd

  if (x === 'fit') {
    // Get bounding box
    const bbox = getStrokedBBoxDefaultVisible()

    if (bbox) {
      batchCmd = new BatchCommand('Fit Canvas to Content')
      const visEls = getVisibleElements()
      svgCanvas.addToSelection(visEls)
      const dx = []; const dy = []
      visEls.forEach(function (_item, _i) {
        dx.push(bbox.x * -1)
        dy.push(bbox.y * -1)
      })

      const cmd = svgCanvas.moveSelectedElements(dx, dy, true)
      batchCmd.addSubCommand(cmd)
      svgCanvas.clearSelection()

      x = Math.round(bbox.width)
      y = Math.round(bbox.height)
    } else {
      return false
    }
  }
  if (x !== w || y !== h) {
    if (!batchCmd) {
      batchCmd = new BatchCommand('Change Image Dimensions')
    }

    x = convertToNum('width', x)
    y = convertToNum('height', y)

    svgCanvas.getSvgContent().setAttribute('width', x)
    svgCanvas.getSvgContent().setAttribute('height', y)

    this.contentW = x
    this.contentH = y
    batchCmd.addSubCommand(new ChangeElementCommand(svgCanvas.getSvgContent(), { width: w, height: h }))

    svgCanvas.getSvgContent().setAttribute('viewBox', [0, 0, x / zoom, y / zoom].join(' '))
    batchCmd.addSubCommand(new ChangeElementCommand(svgCanvas.getSvgContent(), { viewBox: ['0 0', w, h].join(' ') }))

    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', [svgCanvas.getSvgContent()])
  }
  return true
}

/**
* Returns the editor's namespace URL, optionally adding it to the root element.
* @function module:elem-get-set.SvgCanvas#getEditorNS
* @param {boolean} [add] - Indicates whether or not to add the namespace value
* @returns {string} The editor's namespace URL
*/
export const getEditorNSMethod = function (add) {
  if (add) {
    svgCanvas.getSvgContent().setAttribute('xmlns:se', NS.SE)
  }
  return NS.SE
}

/**
 * @typedef {PlainObject} module:elem-get-set.ZoomAndBBox
 * @property {Float} zoom
 * @property {module:utilities.BBoxObject} bbox
 */
/**
* Sets the zoom level on the canvas-side based on the given value.
* @function module:elem-get-set.SvgCanvas#setBBoxZoom
* @param {"selection"|"canvas"|"content"|"layer"|module:SVGEditor.BBoxObjectWithFactor} val - Bounding box object to zoom to or string indicating zoom option. Note: the object value type is defined in `svg-editor.js`
* @param {Integer} editorW - The editor's workarea box's width
* @param {Integer} editorH - The editor's workarea box's height
* @returns {module:elem-get-set.ZoomAndBBox|void}
*/
export const setBBoxZoomMethod = function (val, editorW, editorH) {
  const zoom = svgCanvas.getZoom()
  const selectedElements = svgCanvas.getSelectedElements()
  let spacer = 0.85
  let bb
  const calcZoom = function (bb) {
    if (!bb) { return false }
    const wZoom = Math.round((editorW / bb.width) * 100 * spacer) / 100
    const hZoom = Math.round((editorH / bb.height) * 100 * spacer) / 100
    const zoom = Math.min(wZoom, hZoom)
    svgCanvas.setZoom(zoom)
    return { zoom, bbox: bb }
  }

  if (typeof val === 'object') {
    bb = val
    if (bb.width === 0 || bb.height === 0) {
      const newzoom = bb.zoom ? bb.zoom : zoom * bb.factor
      svgCanvas.setZoom(newzoom)
      return { zoom: zoom, bbox: bb }
    }
    return calcZoom(bb)
  }

  switch (val) {
    case 'selection': {
      if (!selectedElements[0]) { return undefined }
      const selectedElems = selectedElements.map(function (n, _) {
        if (n) {
          return n
        }
        return undefined
      })
      bb = getStrokedBBoxDefaultVisible(selectedElems)
      break
    } case 'canvas': {
      const res = svgCanvas.getResolution()
      spacer = 0.95
      bb = { width: res.w, height: res.h, x: 0, y: 0 }
      break
    } case 'content':
      bb = getStrokedBBoxDefaultVisible()
      break
    case 'layer':
      bb = getStrokedBBoxDefaultVisible(getVisibleElements(svgCanvas.getCurrentDrawing().getCurrentLayer()))
      break
    default:
      return undefined
  }
  return calcZoom(bb)
}

/**
* Sets the zoom to the given level.
* @function module:elem-get-set.SvgCanvas#setZoom
* @param {Float} zoomLevel - Float indicating the zoom level to change to
* @fires module:elem-get-set.SvgCanvas#event:ext_zoomChanged
* @returns {void}
*/
export const setZoomMethod = function (zoomLevel) {
  const selectedElements = svgCanvas.getSelectedElements()
  const res = svgCanvas.getResolution()
  svgCanvas.getSvgContent().setAttribute('viewBox', '0 0 ' + res.w / zoomLevel + ' ' + res.h / zoomLevel)
  svgCanvas.setZoom(zoomLevel)
  selectedElements.forEach(function (elem) {
    if (!elem) { return }
    svgCanvas.selectorManager.requestSelector(elem).resize()
  })
  svgCanvas.pathActions.zoomChange()
  svgCanvas.runExtensions('zoomChanged', zoomLevel)
}

/**
* Change the current stroke/fill color/gradient value.
* @function module:elem-get-set.SvgCanvas#setColor
* @param {string} type - String indicating fill or stroke
* @param {string} val - The value to set the stroke attribute to
* @param {boolean} preventUndo - Boolean indicating whether or not this should be an undoable option
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {void}
*/
export const setColorMethod = function (type, val, preventUndo) {
  const selectedElements = svgCanvas.getSelectedElements()
  svgCanvas.setCurShape(type, val)
  svgCanvas.setCurProperties(type + '_paint', { type: 'solidColor' })
  const elems = []
  /**
*
* @param {Element} e
* @returns {void}
*/
  function addNonG (e) {
    if (e.nodeName !== 'g') {
      elems.push(e)
    }
  }
  let i = selectedElements.length
  while (i--) {
    const elem = selectedElements[i]
    if (elem) {
      if (elem.tagName === 'g') {
        walkTree(elem, addNonG)
      } else if (type === 'fill') {
        if (elem.tagName !== 'polyline' && elem.tagName !== 'line') {
          elems.push(elem)
        }
      } else {
        elems.push(elem)
      }
    }
  }
  if (elems.length > 0) {
    if (!preventUndo) {
      svgCanvas.changeSelectedAttribute(type, val, elems)
      svgCanvas.call('changed', elems)
    } else {
      svgCanvas.changeSelectedAttributeNoUndo(type, val, elems)
    }
  }
}

/**
* Apply the current gradient to selected element's fill or stroke.
* @function module:elem-get-set.SvgCanvas#setGradient
* @param {"fill"|"stroke"} type - String indicating "fill" or "stroke" to apply to an element
* @returns {void}
*/
export const setGradientMethod = function (type) {
  if (!svgCanvas.getCurProperties(type + '_paint') ||
    svgCanvas.getCurProperties(type + '_paint').type === 'solidColor') { return }
  const canvas = svgCanvas
  let grad = canvas[type + 'Grad']
  // find out if there is a duplicate gradient already in the defs
  const duplicateGrad = findDuplicateGradient(grad)
  const defs = findDefs()
  // no duplicate found, so import gradient into defs
  if (!duplicateGrad) {
    // const origGrad = grad;
    grad = svgCanvas.getDOMDocument().importNode(grad, true)
    defs.append(grad)
    // get next id and set it on the grad
    grad.id = svgCanvas.getNextId()
  } else { // use existing gradient
    grad = duplicateGrad
  }
  svgCanvas.setColor(type, 'url(#' + grad.id + ')')
}

/**
* Check if exact gradient already exists.
* @function module:svgcanvas~findDuplicateGradient
* @param {SVGGradientElement} grad - The gradient DOM element to compare to others
* @returns {SVGGradientElement} The existing gradient if found, `null` if not
*/
export const findDuplicateGradient = function (grad) {
  const defs = findDefs()
  const existingGrads = defs.querySelectorAll('linearGradient, radialGradient')
  let i = existingGrads.length
  const radAttrs = ['r', 'cx', 'cy', 'fx', 'fy']
  while (i--) {
    const og = existingGrads[i]
    if (grad.tagName === 'linearGradient') {
      if (grad.getAttribute('x1') !== og.getAttribute('x1') ||
        grad.getAttribute('y1') !== og.getAttribute('y1') ||
        grad.getAttribute('x2') !== og.getAttribute('x2') ||
        grad.getAttribute('y2') !== og.getAttribute('y2')
      ) {
        continue
      }
    } else {
      const gradAttrs = {
        r: Number(grad.getAttribute('r')),
        cx: Number(grad.getAttribute('cx')),
        cy: Number(grad.getAttribute('cy')),
        fx: Number(grad.getAttribute('fx')),
        fy: Number(grad.getAttribute('fy'))
      }
      const ogAttrs = {
        r: Number(og.getAttribute('r')),
        cx: Number(og.getAttribute('cx')),
        cy: Number(og.getAttribute('cy')),
        fx: Number(og.getAttribute('fx')),
        fy: Number(og.getAttribute('fy'))
      }

      let diff = false
      radAttrs.forEach(function (attr) {
        if (gradAttrs[attr] !== ogAttrs[attr]) { diff = true }
      })

      if (diff) { continue }
    }

    // else could be a duplicate, iterate through stops
    const stops = grad.getElementsByTagNameNS(NS.SVG, 'stop')
    const ostops = og.getElementsByTagNameNS(NS.SVG, 'stop')

    if (stops.length !== ostops.length) {
      continue
    }

    let j = stops.length
    while (j--) {
      const stop = stops[j]
      const ostop = ostops[j]

      if (stop.getAttribute('offset') !== ostop.getAttribute('offset') ||
        stop.getAttribute('stop-opacity') !== ostop.getAttribute('stop-opacity') ||
        stop.getAttribute('stop-color') !== ostop.getAttribute('stop-color')) {
        break
      }
    }

    if (j === -1) {
      return og
    }
  } // for each gradient in defs

  return null
}

/**
* Set a color/gradient to a fill/stroke.
* @function module:elem-get-set.SvgCanvas#setPaint
* @param {"fill"|"stroke"} type - String with "fill" or "stroke"
* @param {module:jGraduate.jGraduatePaintOptions} paint - The jGraduate paint object to apply
* @returns {void}
*/
export const setPaintMethod = function (type, paint) {
  // make a copy
  const p = new jGraduate.Paint(paint)
  this.setPaintOpacity(type, p.alpha / 100, true)

  // now set the current paint object
  svgCanvas.setCurProperties(type + '_paint', p)
  switch (p.type) {
    case 'solidColor':
      this.setColor(type, p.solidColor !== 'none' ? '#' + p.solidColor : 'none')
      break
    case 'linearGradient':
    case 'radialGradient':
      svgCanvas.setCanvas(type + 'Grad', p[p.type])
      svgCanvas.setGradient(type)
      break
  }
}
/**
* Sets the stroke width for the current selected elements.
* When attempting to set a line's width to 0, this changes it to 1 instead.
* @function module:elem-get-set.SvgCanvas#setStrokeWidth
* @param {Float} val - A Float indicating the new stroke width value
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {void}
*/
export const setStrokeWidthMethod = function (val) {
  const selectedElements = svgCanvas.getSelectedElements()
  if (val === 0 && ['line', 'path'].includes(svgCanvas.getMode())) {
    svgCanvas.setStrokeWidth(1)
    return
  }
  svgCanvas.setCurProperties('stroke_width', val)

  const elems = []
  /**
*
* @param {Element} e
* @returns {void}
*/
  function addNonG (e) {
    if (e.nodeName !== 'g') {
      elems.push(e)
    }
  }
  let i = selectedElements.length
  while (i--) {
    const elem = selectedElements[i]
    if (elem) {
      if (elem.tagName === 'g') {
        walkTree(elem, addNonG)
      } else {
        elems.push(elem)
      }
    }
  }
  if (elems.length > 0) {
    svgCanvas.changeSelectedAttribute('stroke-width', val, elems)
    svgCanvas.call('changed', selectedElements)
  }
}

/**
* Set the given stroke-related attribute the given value for selected elements.
* @function module:elem-get-set.SvgCanvas#setStrokeAttr
* @param {string} attr - String with the attribute name
* @param {string|Float} val - String or number with the attribute value
* @fires module:elem-get-set.SvgCanvas#event:changed
* @returns {void}
*/
export const setStrokeAttrMethod = function (attr, val) {
  const selectedElements = svgCanvas.getSelectedElements()
  svgCanvas.setCurShape(attr.replace('-', '_'), val)
  const elems = []

  let i = selectedElements.length
  while (i--) {
    const elem = selectedElements[i]
    if (elem) {
      if (elem.tagName === 'g') {
        walkTree(elem, function (e) { if (e.nodeName !== 'g') { elems.push(e) } })
      } else {
        elems.push(elem)
      }
    }
  }
  if (elems.length > 0) {
    svgCanvas.changeSelectedAttribute(attr, val, elems)
    svgCanvas.call('changed', selectedElements)
  }
}
/**
* Check whether selected element is bold or not.
* @function module:svgcanvas.SvgCanvas#getBold
* @returns {boolean} Indicates whether or not element is bold
*/
export const getBoldMethod = function () {
  const selectedElements = svgCanvas.getSelectedElements()
  // should only have one element selected
  const selected = selectedElements[0]
  if (!isNullish(selected) && selected.tagName === 'text' &&
    isNullish(selectedElements[1])) {
    return (selected.getAttribute('font-weight') === 'bold')
  }
  return false
}

/**
* Make the selected element bold or normal.
* @function module:svgcanvas.SvgCanvas#setBold
* @param {boolean} b - Indicates bold (`true`) or normal (`false`)
* @returns {void}
*/
export const setBoldMethod = function (b) {
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (!isNullish(selected) && selected.tagName === 'text' &&
    isNullish(selectedElements[1])) {
    svgCanvas.changeSelectedAttribute('font-weight', b ? 'bold' : 'normal')
  }
  if (!selectedElements[0].textContent) {
    svgCanvas.textActions.setCursor()
  }
}

/**
* Check whether selected element is in italics or not.
* @function module:svgcanvas.SvgCanvas#getItalic
* @returns {boolean} Indicates whether or not element is italic
*/
export const getItalicMethod = function () {
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (!isNullish(selected) && selected.tagName === 'text' &&
    isNullish(selectedElements[1])) {
    return (selected.getAttribute('font-style') === 'italic')
  }
  return false
}

/**
* Make the selected element italic or normal.
* @function module:svgcanvas.SvgCanvas#setItalic
* @param {boolean} i - Indicates italic (`true`) or normal (`false`)
* @returns {void}
*/
export const setItalicMethod = function (i) {
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (!isNullish(selected) && selected.tagName === 'text' &&
    isNullish(selectedElements[1])) {
    svgCanvas.changeSelectedAttribute('font-style', i ? 'italic' : 'normal')
  }
  if (!selectedElements[0].textContent) {
    svgCanvas.textActions.setCursor()
  }
}

/**
 * @function module:svgcanvas.SvgCanvas#setTextAnchorMethod Set the new text anchor
 * @param {string} value - The text anchor value (start, middle or end)
 * @returns {void}
 */
export const setTextAnchorMethod = function (value) {
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (!isNullish(selected) && selected.tagName === 'text' &&
    isNullish(selectedElements[1])) {
    svgCanvas.changeSelectedAttribute('text-anchor', value)
  }
  if (!selectedElements[0].textContent) {
    svgCanvas.textActions.setCursor()
  }
}

/**
* @function module:svgcanvas.SvgCanvas#getFontFamily
* @returns {string} The current font family
*/
export const getFontFamilyMethod = function () {
  return svgCanvas.getCurText('font_family')
}

/**
* Set the new font family.
* @function module:svgcanvas.SvgCanvas#setFontFamily
* @param {string} val - String with the new font family
* @returns {void}
*/
export const setFontFamilyMethod = function (val) {
  const selectedElements = svgCanvas.getSelectedElements()
  svgCanvas.setCurText('font_family', val)
  svgCanvas.changeSelectedAttribute('font-family', val)
  if (selectedElements[0] && !selectedElements[0].textContent) {
    svgCanvas.textActions.setCursor()
  }
}

/**
* Set the new font color.
* @function module:svgcanvas.SvgCanvas#setFontColor
* @param {string} val - String with the new font color
* @returns {void}
*/
export const setFontColorMethod = function (val) {
  svgCanvas.setCurText('fill', val)
  svgCanvas.changeSelectedAttribute('fill', val)
}

/**
* @function module:svgcanvas.SvgCanvas#getFontColor
* @returns {string} The current font color
*/
export const getFontColorMethod = function () {
  return svgCanvas.getCurText('fill')
}

/**
* @function module:svgcanvas.SvgCanvas#getFontSize
* @returns {Float} The current font size
*/
export const getFontSizeMethod = function () {
  return svgCanvas.getCurText('font_size')
}

/**
* Applies the given font size to the selected element.
* @function module:svgcanvas.SvgCanvas#setFontSize
* @param {Float} val - Float with the new font size
* @returns {void}
*/
export const setFontSizeMethod = function (val) {
  const selectedElements = svgCanvas.getSelectedElements()
  svgCanvas.setCurText('font_size', val)
  svgCanvas.changeSelectedAttribute('font-size', val)
  if (selectedElements[0] && !selectedElements[0].textContent) {
    svgCanvas.textActions.setCursor()
  }
}

/**
* @function module:svgcanvas.SvgCanvas#getText
* @returns {string} The current text (`textContent`) of the selected element
*/
export const getTextMethod = function () {
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (isNullish(selected)) { return '' }
  return (selected) ? selected.textContent : ''
}

/**
* Updates the text element with the given string.
* @function module:svgcanvas.SvgCanvas#setTextContent
* @param {string} val - String with the new text
* @returns {void}
*/
export const setTextContentMethod = function (val) {
  svgCanvas.changeSelectedAttribute('#text', val)
  svgCanvas.textActions.init(val)
  svgCanvas.textActions.setCursor()
}

/**
* Sets the new image URL for the selected image element. Updates its size if
* a new URL is given.
* @function module:svgcanvas.SvgCanvas#setImageURL
* @param {string} val - String with the image URL/path
* @fires module:svgcanvas.SvgCanvas#event:changed
* @returns {void}
*/
export const setImageURLMethod = function (val) {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  const elem = selectedElements[0]
  if (!elem) { return }

  const attrs = {
    width: elem.getAttribute('width'),
    height: elem.getAttribute('height')
  }
  const setsize = (!attrs.width || !attrs.height)

  const curHref = getHref(elem)

  // Do nothing if no URL change or size change
  if (curHref === val && !setsize) {
    return
  }

  const batchCmd = new BatchCommand('Change Image URL')

  setHref(elem, val)
  batchCmd.addSubCommand(new ChangeElementCommand(elem, {
    '#href': curHref
  }))
  const img = new Image()
  img.onload = function () {
    const changes = {
      width: elem.getAttribute('width'),
      height: elem.getAttribute('height')
    }
    elem.setAttribute('width', this.width)
    elem.setAttribute('height', this.height)

    svgCanvas.selectorManager.requestSelector(elem).resize()

    batchCmd.addSubCommand(new ChangeElementCommand(elem, changes))
    svgCanvas.addCommandToHistory(batchCmd)
    svgCanvas.call('changed', [elem])
  }
  img.src = val
}

/**
* Sets the new link URL for the selected anchor element.
* @function module:svgcanvas.SvgCanvas#setLinkURL
* @param {string} val - String with the link URL/path
* @returns {void}
*/
export const setLinkURLMethod = function (val) {
  const { ChangeElementCommand, BatchCommand } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  let elem = selectedElements[0]
  if (!elem) { return }
  if (elem.tagName !== 'a') {
    // See if parent is an anchor
    const parentsA = getParents(elem.parentNode, 'a')
    if (parentsA?.length) {
      elem = parentsA[0]
    } else {
      return
    }
  }

  const curHref = getHref(elem)

  if (curHref === val) { return }

  const batchCmd = new BatchCommand('Change Link URL')

  setHref(elem, val)
  batchCmd.addSubCommand(new ChangeElementCommand(elem, {
    '#href': curHref
  }))

  svgCanvas.addCommandToHistory(batchCmd)
}

/**
* Sets the `rx` and `ry` values to the selected `rect` element
* to change its corner radius.
* @function module:svgcanvas.SvgCanvas#setRectRadius
* @param {string|Float} val - The new radius
* @fires module:svgcanvas.SvgCanvas#event:changed
* @returns {void}
*/
export const setRectRadiusMethod = function (val) {
  const { ChangeElementCommand } = svgCanvas.history
  const selectedElements = svgCanvas.getSelectedElements()
  const selected = selectedElements[0]
  if (!isNullish(selected) && selected.tagName === 'rect') {
    const r = Number(selected.getAttribute('rx'))
    if (r !== val) {
      selected.setAttribute('rx', val)
      selected.setAttribute('ry', val)
      svgCanvas.addCommandToHistory(new ChangeElementCommand(selected, { rx: r, ry: r }, 'Radius'))
      svgCanvas.call('changed', [selected])
    }
  }
}

/**
* Wraps the selected element(s) in an anchor element or converts group to one.
* @function module:svgcanvas.SvgCanvas#makeHyperlink
* @param {string} url
* @returns {void}
*/
export const makeHyperlinkMethod = function (url) {
  svgCanvas.groupSelectedElements('a', url)

  // TODO: If element is a single "g", convert to "a"
  //  if (selectedElements.length > 1 && selectedElements[1]) {
}

/**
* @function module:svgcanvas.SvgCanvas#removeHyperlink
* @returns {void}
*/
export const removeHyperlinkMethod = function () {
  svgCanvas.ungroupSelectedElement()
}

/**
* Group: Element manipulation.
*/

/**
* Sets the new segment type to the selected segment(s).
* @function module:svgcanvas.SvgCanvas#setSegType
* @param {Integer} newType - New segment type. See {@link https://www.w3.org/TR/SVG/paths.html#InterfaceSVGPathSeg} for list
* @returns {void}
*/
export const setSegTypeMethod = function (newType) {
  svgCanvas.pathActions.setSegType(newType)
}

/**
* Set the background of the editor (NOT the actual document).
* @function module:svgcanvas.SvgCanvas#setBackground
* @param {string} color - String with fill color to apply
* @param {string} url - URL or path to image to use
* @returns {void}
*/
export const setBackgroundMethod = function (color, url) {
  const bg = getElement('canvasBackground')
  const border = bg.querySelector('rect')
  let bgImg = getElement('background_image')
  let bgPattern = getElement('background_pattern')
  border.setAttribute('fill', color === 'chessboard' ? '#fff' : color)
  if (color === 'chessboard') {
    if (!bgPattern) {
      bgPattern = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'foreignObject')
      svgCanvas.assignAttributes(bgPattern, {
        id: 'background_pattern',
        width: '100%',
        height: '100%',
        preserveAspectRatio: 'xMinYMin',
        style: 'pointer-events:none'
      })
      const div = document.createElement('div')
      svgCanvas.assignAttributes(div, {
        style: 'pointer-events:none;width:100%;height:100%;' +
          'background-image:url(data:image/gif;base64,' +
          'R0lGODlhEAAQAIAAAP///9bW1iH5BAAAAAAALAAAAAAQABAAAAIfjG+' +
          'gq4jM3IFLJgpswNly/XkcBpIiVaInlLJr9FZWAQA7);'
      })
      bgPattern.append(div)
      bg.append(bgPattern)
    }
  } else if (bgPattern) {
    bgPattern.remove()
  }
  if (url) {
    if (!bgImg) {
      bgImg = svgCanvas.getDOMDocument().createElementNS(NS.SVG, 'image')
      svgCanvas.assignAttributes(bgImg, {
        id: 'background_image',
        width: '100%',
        height: '100%',
        preserveAspectRatio: 'xMinYMin',
        style: 'pointer-events:none'
      })
    }
    setHref(bgImg, url)
    bg.append(bgImg)
  } else if (bgImg) {
    bgImg.remove()
  }
}
