declare module "*.png" {
	const img: string;

	export default img;
}

declare module "*.svg" {
	const img: SVGSVGElement;

	export default img;
}

declare module "*?raw" {
	const mod: string;

	export default mod;
}