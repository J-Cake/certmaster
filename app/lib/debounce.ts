import React from "react";

export default function useDebouncedEffect(effect: () => void | (() => void), deps: any[], delay: number) {
	React.useEffect(() => {
		const handler = setTimeout(() => effect(), delay);
		return () => clearTimeout(handler);
	}, [...deps, delay]);
}