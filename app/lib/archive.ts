import * as tar from '@gera2ld/tarjs';

export type Archive = Awaited<ReturnType<typeof archive>>;
export type ArchiveFile = Awaited<ReturnType<typeof configFile>>;
export type ArchiveFileList = Awaited<ReturnType<Archive['listFiles']>>;

export default async function archive(archive: Blob) {
	const reader = await tar.TarReader.load(archive);

	const files = await Promise.all(reader.fileInfos
		.map(file => Object.assign(file, {
			canonicalName: file.name.split('/').pop()!,
		}))
		.map(async file => [file.canonicalName, await configFile(file.canonicalName, reader.getFileBlob(file.name))] as const))
		.then(files => Object.fromEntries(files));

	return {
		listFiles() {
			return Object.values(files);
		},

		async readText(name: string) {
			return files[name].readText();
		},

		async read(name: string) {
			return files[name].read();
		},

		async writeText(name: string, text: string) {
			return files[name].writeText(text);
		},

		async write(name: string, data: Uint8Array) {
			return files[name].write(data);
		},

		rename(oldName: string, newName: string) {
			files[newName] = files[oldName];
			files[newName].rename(newName);
			delete files[oldName];
		},

		delete(name: string) {
			delete files[name];
		},

		async create(name: string) {
			return files[name] = await configFile(name, new Blob());
		}
	};
}

export async function configFile(name: string, blob: Blob) {
	let content = blob;
	let fileName = name;

	return {
		meta() {
			return {
				name: fileName,
				size: content.size,
			}
		},

		async readText(): Promise<string> {
			return await content.text()
		},

		async read(): Promise<Uint8Array> {
			return content.arrayBuffer()
				.then(ab => new Uint8Array(ab));
		},

		async writeText(text: string) {
			content = new Blob([text], {type: 'text/plain'});
		},

		async write(data: Uint8Array) {
			content = new Blob([data], {type: 'application/octet-stream'});
		},

		rename(newName: string) {
			fileName = newName;
		}
	}
}