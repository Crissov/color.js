import * as util from "./util.js";

export default class Color {
	// Signatures:
	// new Color(stringToParse)
	// new Color(otherColor)
	// new Color(coords, alpha) // defaults to sRGB
	constructor (spaceId, coords, alpha = 1) {
		if (arguments.length === 1) {
			let color = arguments[0];

			if (util.isString(color)) {
				// Just a string provided, parse
				color = Color.parse(color);

				if (!color) {
					throw new TypeError(`Cannot parse "${arguments[0]}" as a color`);
				}
			}

			if (color) {
				this.spaceId = color.spaceId;
				this.coords = color.coords;
				this.alpha = color.alpha;
			}
		}
		else {
			if (Array.isArray(spaceId)) {
				// No color space provided, default to sRGB
				[spaceId, coords, alpha] = ["sRGB", spaceId, coords];
			}

			this.spaceId = spaceId;
			this.coords = coords;
			this.alpha = alpha;
		}

		this.alpha = this.alpha < 1? this.alpha : 1; // this also deals with NaN etc
	}

	get space () {
		return _.spaces[this.spaceId];
	}

	get spaceId () {
		return this._spaceId;
	}

	// Handle dynamic changes of color space
	set spaceId (id) {
		id = id.toLowerCase();
		let newSpace = _.spaces[id];

		if (id !== "xyz" && !newSpace) {
			throw new TypeError(`No color space found with id = "${id}"`);
		}

		let previousColorSpaceId = this._spaceId;

		if (previousColorSpaceId && this.space) {
			// We’re not setting this for the first time, need to:
			// a) Convert coords
			this.coords = this[id];

			// b) Remove instance properties from previous color space
			for (let prop in this.space.instance) {
				if (this.hasOwnProperty(prop)) {
					delete this[prop];
				}
			}
		}

		this._spaceId = id;

		if (id !== "xyz") {
			// Add new instance properties from new color space
			util.extend(this, this.space.instance);
		}

	}

	get white () {
		return this.space.white || _.D50;
	}

	set white (value) {
		// Custom white point
		Object.defineProperty(this, "white", {value, writable: true});
		// We DO NOT do color adaptation of the current coords
	}

	get XYZ () {
		if (this.spaceId === "xyz") {
			return this.coords;
		}
		else {
			return this.space.toXYZ(this.coords);
		}
	}

	set XYZ (coords) {
		if (this.spaceId === "xyz") {
			this.coords = coords;
		}
		else {
			this.coords = this.space.fromXYZ(coords);
		}
	}

	// 1976 DeltaE. 2.3 is the JND
	deltaE (color) {
		let lab1 = this.lab;
		let lab2 = color.lab;
		return Math.sqrt([0, 1, 2].reduce((a, i) => a + (lab2[i] - lab1[i]) ** 2, 0));
	}

	luminance () {
		return this.Y / this.white.Y;
	}

	contrast (color) {
		return (this.luminance + .05) / (color.luminance + .05);
	}

	// Get formatted coords
	getCoords ({inGamut, precision = 5} = {}) {
		let coords = this.coords;

		if (inGamut === true && !this.inGamut()) {
			coords = this.coordsInGamut();
		}

		if (precision !== undefined) {
			let coordRanges = this.space.coords? Object.values(this.space.coords) : [];

			coords = coords.map((n, i) => util.toPrecision(n, precision, coordRanges[i]));

		}

		return coords;
	}

	/**
	 * @return {Boolean} Is the color in gamut?
	 */
	inGamut() {
		return this.space.inGamut && this.space.inGamut(this.coords);
	}

	// Convert to color space and return a new color
	to (space) {
		let id = space;

		if (!util.isString(space)) {
			id = space.id;
		}

		return new Color(id, this[id], this.alpha);
	}

	toJSON () {
		// TODO return white point as well if custom
		return {
			spaceId: this.spaceId,
			coords: this.coords,
			alpha: this.alpha
		};
	}

	/**
	 * Generic toString() method, outputs a color(spaceId ...coords) function
	 * @param {Object} options
	 * @param {number} options.precision - Significant digits
	 * @param {boolean} options.commas - Whether to use commas to separate arguments or spaces (and a slash for alpha) [default: false]
	 * @param {Function|String|Array} options.format - If function, maps all coordinates. Keywords tap to colorspace-specific formats (e.g. "hex")
	 * @param {boolean} options.inGamut - Adjust coordinates to fit in gamut first? [default: false]
	 * @param {string} options.name - Function name [default: color]
	 */
	toString ({precision = 5, format, commas, inGamut, name = "color"} = {}) {
		let strAlpha = this.alpha < 1? ` ${commas? "," : "/"} ${this.alpha}` : "";

		let coords = this.getCoords({inGamut, precision});

		if (util.isString(format)) {
			if (format === "%") {
				format = c => c * 100 + "%";
			}
		}

		if (typeof format === "function") {
			coords = coords.map(format);
		}

		let args = [...coords];

		if (name === "color") {
			// If output is a color() function, add colorspace id as first argument
			args.unshift(this.space? this.space.cssId || this.space.id : "XYZ");
		}

		return `${name}(${args.join(commas? ", " : " ")}${strAlpha})`;
	}

	// Adapt XYZ from white point W1 to W2
	static chromaticAdaptation (W1, W2, XYZ) {
		if (W1 === W2) {
			return XYZ;
		}

		let M;

		if (W1 === _.D65 && W2 === _.D50) {
			M = [
				[ 1.0478112,  0.0228866, -0.0501270],
				[ 0.0295424,  0.9904844, -0.0170491],
				[-0.0092345,  0.0150436,  0.7521316]
			];
		}
		else if (W1 === _.D50 && W2 === _.D65) {
			M = [
				[ 0.9555766, -0.0230393,  0.0631636],
				[-0.0282895,  1.0099416,  0.0210077],
				[ 0.0122982, -0.0204830,  1.3299098]
			];
		}

		if (M) {
			return util.multiplyMatrices(M, XYZ);
		}
		else {
			throw new TypeError("Only white points D50 and D65 supported for now.");
		}
	}

	// CSS color to Color object
	static parse (str) {
		let parsed = _.parseFunction(str);
		let isRGB = parsed && parsed.name.indexOf("rgb") === 0;

		// Try colorspace-specific parsing
		for (let space of Object.values(_.spaces)) {
			if (space.parse) {
				let color = space.parse(str, parsed);

				if (color) {
					return color;
				}
			}
		}

		if ((!parsed || !isRGB)
		    && typeof document !== "undefined" && document.head // Do we have a DOM?
		) {
			// Use browser to parse when a DOM is available
			// this is how we parse #hex or color names, or RGB transformations like hsl()
			let previousColor = document.head.style.color;
			document.head.style.color = "";
			document.head.style.color = str;

			if (document.head.style.color !== previousColor) {
				let computed = getComputedStyle(document.head).color;
				document.head.style.color = previousColor;

				if (computed) {
					str = computed;
					parsed = _.parseFunction(computed);
				}
			}
		}

		// parsed might have changed, recalculate
		isRGB = parsed && parsed.name.indexOf("rgb") === 0;

		if (parsed) {
			// It's a function
			if (isRGB) {
				let args = parsed.args.map((c, i) => i < 3 && !c.percentage? c / 255 : +c);

				return {
					spaceId: "srgb",
					coords: args.slice(0, 3),
					alpha: args[3]
				};
			}
			else if (parsed.name === "color") {
				let spaceId = parsed.args.shift();
				let space = Object.values(_.spaces).find(space => (space.cssId || space.id) === spaceId);

				if (space) {
					let argCount = Object.keys(space.coords).length;

					return {
						spaceId: space.id,
						coords: parsed.args.slice(0, argCount),
						alpha: parsed.args.slice(argCount)[0]
					};
				}
				else {
					throw new TypeError(`Color space ${spaceId} not found. Missing a plugin?`);
				}
			}
		}
	}

	/**
	 * Parse a CSS function, regardless of its name and arguments
	 * @param String str String to parse
	 * @return Object An object with {name, args, rawArgs}
	 */
	static parseFunction (str) {
		if (!str) {
			return;
		}

		str = str.trim();

		const isFunctionRegex = /^([a-z]+)\((.+?)\)$/i;
		const isNumberRegex = /^-?[\d.]+$/;
		let parts = str.match(isFunctionRegex);

		if (parts) {
			// It is a function, parse args
			let args = parts[2].match(/([-\w.]+(?:%|deg)?)/g);

			args = args.map(arg => {
				if (/%$/.test(arg)) {
					// Convert percentages to 0-1 numbers
					let n = new Number(+arg.slice(0, -1) / 100);
					n.percentage = true;
					return n;
				}
				else if (/deg$/.test(arg)) {
					// Drop deg from degrees and convert to number
					let n = new Number(+arg.slice(0, -3));
					n.deg = true;
					return n;
				}
				else if (isNumberRegex.test(arg)) {
					// Convert numerical args to numbers
					return +arg;
				}

				// Return everything else as-is
				return arg;
			});

			return {
				name: parts[1],
				rawArgs: parts[2],
				// An argument could be (as of css-color-4):
				// a number, percentage, degrees (hue), ident (in color())
				args
			};
		}
	}

	// One-off convert between color spaces
	static convert (coords, fromId, toId, fromWhite) {
		fromId = fromId.toLowerCase();
		toId = toId.toLowerCase();

		let fromSpace = _.spaces[fromId];
		let toSpace = _.spaces[toId];

		fromWhite = fromWhite || fromSpace.white;

		if (fromId === toId && toSpace.white === fromWhite) {
			// Same space, same white point, no change needed
			return coords;
		}

		// Do we have a more specific conversion function?
		// Avoids round-tripping to & from XYZ
		let Id = util.capitalize(fromId);

		if (("from" + Id) in toSpace) {
			// No white point adaptation, we assume the custom function takes care of it
			return space["from" + Id](coords);
		}

		let XYZ = fromId === "xyz"? coords : fromSpace.toXYZ(coords);

		if (toSpace.white !== fromWhite) {
			// Different white point, perform white point adaptation
			XYZ = _.chromaticAdaptation(fromWhite, toSpace.white, XYZ);
		}

		return toSpace.fromXYZ(XYZ);
	}

	// Define a new color space
	static defineSpace ({id, inherits}) {
		let space = _.spaces[id] = arguments[0];

		if (inherits) {
			const except = ["id", "parse", "instance", "properties"];
			let parent = _.spaces[inherits];

			for (let prop in parent) {
				if (!except.includes(prop) && !(prop in space)) {
					util.copyDescriptor(space, parent, prop);
				}
			}
		}

		let coords = space.coords;

		if (space.properties) {
			util.extend(_.prototype, space.properties);
		}

		if (!space.fromXYZ && !space.toXYZ) {
			// Using a different connection space, define from/to XYZ functions based on that

			// What are we using as a connection space?
			for (let prop in space) {
				if (typeof space[prop] === "function") {
					// Is the name of the form fromXxx or toXxx?
					let Id = (prop.match(/^(?:from|to)([A-Z][a-zA-Z]+$)/) || [])[1];

					if (Id && ("from" + Id) in space && ("to" + Id) in space) {
						// This is a conversion function AND we have both from & to!
						let space = _.spaces[Id.toLowerCase()];

						if (space) {
							// var used intentionally
							var connectionSpace = space;
							var fromConnection = "from" + Id;
							var toConnection = "to" + Id;
							break;
						}
					}
				}
			}

			if (connectionSpace) {
				// Define from/to XYZ functions based on the connection space

				if (!connectionSpace.toXYZ || !connectionSpace.fromXYZ) {
					throw new ReferenceError(`Connection space ${connectionSpace.name} for ${space.name} has no toXYZ()/fromXYZ() functions.`);
				}

				Object.assign(space, {
					// ISSUE do we need white point adaptation here?
					fromXYZ(XYZ) {
						let newCoords = connectionSpace.fromXYZ(XYZ);
						return this[fromConnection](newCoords);
					},
					toXYZ(coords) {
						let newCoords = this[toConnection](coords);
						return connectionSpace.toXYZ(newCoords);
					}
				});
			}
			else {
				throw new ReferenceError(`No connection space found for ${space.name}.`);
			}
		}

		// Define getters and setters for color.spaceId
		// e.g. color.lch on *any* color gives us the lch coords
		Object.defineProperty(_.prototype, id, {
			// Convert coords to coords in another colorspace and return them
			// Source colorspace: this.spaceId
			// Target colorspace: id
			get() {
				return _.convert(this.coords, this.spaceId, space.id, this.white);
			},
			// Convert coords in another colorspace to internal coords and set them
			// Target colorspace: this.spaceId
			// Source colorspace: id
			set(coords) {
				let Id = util.capitalize(this.spaceId[0]);

				if (("to" + Id) in space) {
					this[id] = space["to" + Id](coords);
				}
				else {
					let XYZ = space.toXYZ(coords);

					if (space.white !== this.white) {
						// Different white point, perform white point adaptation
						XYZ = _.chromaticAdaptation(space.white, this.white, XYZ);
					}

					this.XYZ = XYZ;
				}

			},
			configurable: true,
			enumerable: true
		});

		_.defineCoordAccessors(id, Object.keys(coords));

		return space;
	}

	static defineCoordAccessors(id, coordNames) {
		coordNames.forEach((coord, i) => {
			Object.defineProperty(_.prototype, coord, {
				get() {
					if (coord in this.space.coords) {
						return this.coords[i];
					}
					else {
						return this[id][i];
					}
				},
				set(value) {
					let coords = this[id];
					coords[i] = value;
					this[id] = coords;
				},
				configurable: true,
				enumerable: true
			});
		});
	}
};

let _  = Color;

_.defineCoordAccessors("XYZ", ["X", "Y", "Z"]);

_.spaces = {};
// whitepoint values from ASTM E308-01, 10nm spacing, 1931 2 degree observer
// all normalized to Y (luminance) = 1.00000
// Illuminant A is a tungsten electric light, giving a very warm, orange light.
_.A  = new Color("XYZ", [1.09850, 1.00000, 0.35585]);
// Illuminant C was an early approximation to daylight: illuminant A with a blue filter.
_.C = new Color("XYZ", [0.98074, 1.000000, 1.18232]);
// The daylight series of illuminants simulate natural daylight.
// The color temperature (in degrees Kelvin) ranges from
// cool, overcast daylight (D50) to bright, direct sunlight (D65).
_.D50 = new Color("XYZ", [0.96422, 1.00000, 0.82521]);
_.D55 = new Color("XYZ", [0.95682, 1.00000, 0.92149]);
_.D65 = new Color("XYZ", [0.95047, 1.00000, 1.08883]);
_.D65.white = _.D65;
_.D75 = new Color("XYZ", [0.94972, 1.00000, 1.22638]);
// The F series of illuminants represent flourescent lights
_.F2  = new Color("XYZ", [0.99186, 1.00000, 67.393]);
_.F7  = new Color("XYZ", [0.95041, 1.00000, 1.08747]);
_.F11  = new Color("XYZ", [1.00962, 1.00000, 0.64350]);
export {util};
