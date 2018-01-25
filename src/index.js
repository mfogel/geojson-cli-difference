const fs = require('fs')
const { Transform } = require('stream')
const geojsonhint = require('@mapbox/geojsonhint')
const turfBbox = require('@turf/bbox')
const turfDifference = require('@turf/difference')
const turfHelpers = require('@turf/helpers')
const turfRewind = require('@turf/rewind')

/* If path is to a file, it will be added to flatPaths.
 *
 * If path is to a directory, all of its contents will be
 * each added to flatPaths.
 */
const flattenPath = (path, flatPaths) => {
  try {
    const stat = fs.statSync(path)
    if (stat.isDirectory()) {
      const filenames = fs.readdirSync(path)
      filenames.forEach(fn => flatPaths.push(`${path}/${fn}`))
    } else {
      flatPaths.push(path)
    }
  } catch (err) {
    throw new Error(`Error cheking ${path}: ${err.message}`)
  }
}

/* Regular expression for matching a bbounding box */
const numRegex = '-?[0-9]+.?[0-9]*'
const bboxRegex = RegExp(
  `\\[${numRegex},${numRegex},${numRegex},${numRegex}\\]`
)

const bboxOverlap = (bbox1, bbox2) => {
  let [x1min, y1min, x1max, y1max] = bbox1
  let [x2min, y2min, x2max, y2max] = bbox2

  /* account for antimeridian cutting
   * https://tools.ietf.org/html/rfc7946#section-5.2 */
  if (x1min > x1max) x1min -= 360
  if (x2min > x2max) x2min -= 360

  if (x2min > x1max || y2min > y1max) return false
  if (x1min > x2max || y1min > y2max) return false
  return true
}

class GeojsonNullTransform extends Transform {
  constructor (options = {}) {
    const warn = options['warn']
    delete options['warn']

    options['decodeStrings'] = false
    super(options)

    this.input = ''
    this.warn = warn
  }

  _transform (chunk, encoding, callback) {
    this.input += chunk
    callback()
  }

  _flush (callback) {
    try {
      let geojson = this.parse(this.input, 'stdin')
      geojson = this.operate(geojson)
      callback(null, JSON.stringify(geojson))
    } catch (err) {
      callback(err)
    }
  }

  parse (str, from) {
    let geojson
    try {
      geojson = JSON.parse(str)
    } catch (err) {
      throw new SyntaxError(`Unable to parse JSON from ${from}: ${err.message}`)
    }

    const errors = geojsonhint.hint(geojson)
    errors.forEach(e =>
      this.warn(`Warning: JSON from ${from} is not valid GeoJSON: ${e.message}`)
    )

    return geojson
  }

  operate (geojson) {
    /* pass through for testing */
    return geojson
  }
}

class DifferenceTransform extends GeojsonNullTransform {
  constructor (options = {}) {
    const filesToSubtract = options['filesToSubtract']
    const respectBboxesInFilenames = options['respectBboxesInFilenames']
    delete options['filesToSubtract']

    super(options)

    this.filesToSubtract = filesToSubtract
    this.respectBboxesInFilenames = respectBboxesInFilenames
  }

  operate (geojson) {
    /* helper to skip over lines, points when recursing */
    const checkSimpleType = (type, name) => {
      if (['Polygon', 'MultiPolygon'].includes(type)) return true
      else {
        this.warn(
          `${name} includes simple Geojson object of type '${type}'. Ignoring`
        )
        return false
      }
    }

    /* helper to recursively walk down minuend, subtrahends, subtracting
     * subtrahends from minuend as we go down */
    const subtractGeojsons = (minuend, subtrahends) => {
      if (minuend['coordinates']) {
        if (!checkSimpleType(minuend['type'], 'Minuend')) return minuend

        subtrahends.some(subtrahend => {
          if (subtrahend['coordinates']) {
            if (!checkSimpleType(subtrahend['type'], 'A subtrahend')) {
              return false
            }
            minuend = turfDifference(minuend, subtrahend)
            /* turfDifference returns a Feature or null, with backwards winding */
            /* turfRewind sets winding to be RFC-compliant */
            if (minuend) {
              minuend = turfRewind(minuend, { mutate: true }).geometry
            }
          }

          if (subtrahend['geometry']) {
            minuend = subtractGeojsons(minuend, [subtrahend['geometry']])
          }

          if (subtrahend['geometries']) {
            minuend = subtractGeojsons(minuend, subtrahend['geometries'])
          }

          if (subtrahend['features']) {
            minuend = subtractGeojsons(minuend, subtrahend['features'])
          }

          if (!minuend) return true
        })
        return minuend
      }

      if (minuend['geometry']) {
        minuend['geometry'] = subtractGeojsons(minuend['geometry'], subtrahends)
      }

      if (minuend['geometries']) {
        minuend['geometries'] = minuend['geometries']
          .map(geom => subtractGeojsons(geom, subtrahends))
          .filter(geom => geom !== null)
      }

      if (minuend['features']) {
        minuend['features'] = minuend['features']
          .map(geom => subtractGeojsons(geom, subtrahends))
          .filter(geom => geom !== null)
      }

      return minuend
    }

    /* helper to test a filename for bbox presence and overlap */
    const isBboxPresentWithOverlap = (filename, minuendBbox) => {
      const reMatch = bboxRegex.exec(filename)
      if (reMatch === null) return true
      const subtrahendBbox = JSON.parse(reMatch[0])
      return bboxOverlap(minuendBbox, subtrahendBbox)
    }

    /* filter down the subtrahends if we're looking for bboxes in filenames */
    if (this.respectBboxesInFilenames) {
      const minuendBbox = turfBbox(geojson)
      this.filesToSubtract = this.filesToSubtract.filter(fn =>
        isBboxPresentWithOverlap(fn, minuendBbox)
      )
    }

    /* nothing to subtract - but still run it through the process
     * for warnings if minuend has bad geojson (ex: non-polygon geometries) */
    if (this.filesToSubtract.length === 0) {
      geojson = subtractGeojsons(geojson, [])
    }

    /* do the actual subtraction */
    this.filesToSubtract.every(fileToSubtract => {
      const subtrahend = this.parse(
        fs.readFileSync(fileToSubtract, 'utf8'),
        fileToSubtract
      )
      geojson = subtractGeojsons(geojson, [subtrahend])
      if (!geojson) {
        /* using an empty FeatureCollection to represent an empty result */
        geojson = turfHelpers.featureCollection([])
        return false
      }
      return true
    })

    return geojson
  }
}
module.exports = {
  bboxRegex,
  bboxOverlap,
  flattenPath,
  GeojsonNullTransform,
  DifferenceTransform
}
