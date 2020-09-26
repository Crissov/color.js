import Color from "./srgb.js";

Color.defineSpace({
	inherits: "srgb",
	id: "dic-p3",
	name: "DCI P3",
	cssId: "dci-p3",
	white: Color.whites.Theater,
	// Gamma correction is the same as sRGB
	// convert an array of dci-p3 values to CIE XYZ
	// using Theater {0.3140, 0.3510} instead of D65 = {0.3127, 0.3290} (no chromatic adaptation)
	// http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
	// Functions are the same as sRGB, just with different matrices
	toXYZ_M: [
		[0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
		[0.2289745640697488, 0.6917385218365064,  0.079286914093745],
		[0.0,                0.04511338185890264, 1.043944368900976]
	],
	fromXYZ_M: [
		[ 2.493496911941425,   -0.9313836179191239, -0.40271078445071684],
		[-0.8294889695615747,   1.7626640603183463,  0.023624685841943577],
		[ 0.03584583024378447, -0.07617238926804182, 0.9568845240076872]
	]
});
