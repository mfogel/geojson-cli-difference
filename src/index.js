const fs = require('fs')
const { Transform } = require('stream')
const geojsonhint = require('@mapbox/geojsonhint')
const turfDifference = require('@turf/difference')
const turfHelpers = require('@turf/helpers')
const turfRewind = require('@turf/rewind')

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
      let geojson = this.parse(this.input)
      geojson = this.operate(geojson)
      callback(null, JSON.stringify(geojson))
    } catch (err) {
      callback(err)
    }
  }

  parse (str) {
    let geojson
    try {
      geojson = JSON.parse(str)
    } catch (err) {
      throw new SyntaxError(`Unable to parse input as JSON: ${err.message}`)
    }

    const errors = geojsonhint.hint(geojson)
    errors.forEach(e =>
      this.warn(`Warning: Input is not valid GeoJSON: ${e.message}`)
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
    delete options['filesToSubtract']

    super(options)

    this.filesToSubtract = filesToSubtract
  }

  operate (geojson) {
    const subtrahends = this.filesToSubtract.map(file =>
      this.parse(fs.readFileSync(file, 'utf8'))
    )

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

    let diff = subtractGeojsons(geojson, subtrahends)

    /* using an empty FeatureCollection to represent an empty result */
    if (!diff) diff = turfHelpers.featureCollection([])

    return diff
  }
}
module.exports = { GeojsonNullTransform, DifferenceTransform }
