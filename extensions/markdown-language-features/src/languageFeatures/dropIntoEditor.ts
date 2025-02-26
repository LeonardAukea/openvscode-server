/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as URI from 'vscode-uri';
import { Schemes } from '../util/schemes';

export const imageFileExtensions = new Set<string>([
	'bmp',
	'gif',
	'ico',
	'jpe',
	'jpeg',
	'jpg',
	'png',
	'psd',
	'svg',
	'tga',
	'tif',
	'tiff',
	'webp',
]);

export function registerDropIntoEditorSupport(selector: vscode.DocumentSelector) {
	return vscode.languages.registerDocumentDropEditProvider(selector, new class implements vscode.DocumentDropEditProvider {
		async provideDocumentDropEdits(document: vscode.TextDocument, _position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
			const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.drop.enabled', true);
			if (!enabled) {
				return undefined;
			}

			const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
			return snippet ? new vscode.DocumentDropEdit(snippet) : undefined;
		}
	});
}

export async function tryGetUriListSnippet(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.SnippetString | undefined> {
	const urlList = await dataTransfer.get('text/uri-list')?.asString();
	if (!urlList || token.isCancellationRequested) {
		return undefined;
	}

	const uris: vscode.Uri[] = [];
	for (const resource of urlList.split('\n')) {
		try {
			uris.push(vscode.Uri.parse(resource));
		} catch {
			// noop
		}
	}

	return createUriListSnippet(document, uris);
}

interface UriListSnippetOptions {
	readonly placeholderText?: string;

	readonly placeholderStartIndex?: number;

	/**
	 * Should the snippet be for an image?
	 *
	 * If `undefined`, tries to infer this from the uri.
	 */
	readonly insertAsImage?: boolean;

	readonly separator?: string;
}

export function createUriListSnippet(document: vscode.TextDocument, uris: readonly vscode.Uri[], options?: UriListSnippetOptions): vscode.SnippetString | undefined {
	if (!uris.length) {
		return undefined;
	}

	const dir = getDocumentDir(document);

	const snippet = new vscode.SnippetString();
	uris.forEach((uri, i) => {
		const mdPath = dir && dir.scheme === uri.scheme && dir.authority === uri.authority
			? encodeURI(path.posix.relative(dir.path, uri.path))
			: uri.toString(false);

		const ext = URI.Utils.extname(uri).toLowerCase().replace('.', '');
		const insertAsImage = typeof options?.insertAsImage === 'undefined' ? imageFileExtensions.has(ext) : !!options.insertAsImage;

		snippet.appendText(insertAsImage ? '![' : '[');

		const placeholderText = options?.placeholderText ?? (insertAsImage ? 'Alt text' : 'label');
		const placeholderIndex = typeof options?.placeholderStartIndex !== 'undefined' ? options?.placeholderStartIndex + i : undefined;
		snippet.appendPlaceholder(placeholderText, placeholderIndex);

		snippet.appendText(`](${mdPath})`);

		if (i < uris.length - 1 && uris.length > 1) {
			snippet.appendText(options?.separator ?? ' ');
		}
	});
	return snippet;
}

function getDocumentDir(document: vscode.TextDocument): vscode.Uri | undefined {
	const docUri = getParentDocumentUri(document);
	if (docUri.scheme === Schemes.untitled) {
		return vscode.workspace.workspaceFolders?.[0]?.uri;
	}
	return URI.Utils.dirname(docUri);
}

export function getParentDocumentUri(document: vscode.TextDocument): vscode.Uri {
	if (document.uri.scheme === Schemes.notebookCell) {
		for (const notebook of vscode.workspace.notebookDocuments) {
			for (const cell of notebook.getCells()) {
				if (cell.document === document) {
					return notebook.uri;
				}
			}
		}
	}

	return document.uri;
}
