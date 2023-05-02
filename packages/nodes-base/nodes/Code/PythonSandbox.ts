import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { LoadPyodide } from './Pyodide';
import type { SandboxContext } from './Sandbox';
import { Sandbox } from './Sandbox';

type PythonSandboxContext = {
	[K in keyof SandboxContext as K extends `$${infer I}` ? `_${I}` : K]: SandboxContext[K];
};

type PyodideError = Error & { type: string };

export class PythonSandbox extends Sandbox {
	constructor(
		private context: PythonSandboxContext,
		private pythonCode: string,
		private moduleImports: string[],
		itemIndex: number | undefined,
		helpers: IExecuteFunctions['helpers'],
	) {
		super(
			{
				object: {
					singular: 'dictionary',
					plural: 'dictionaries',
				},
			},
			itemIndex,
			helpers,
		);
	}

	async runCodeAllItems() {
		const executionResult = await this.runCodeInPython<INodeExecutionData[]>();
		return this.validateRunCodeAllItems(executionResult);
	}

	async runCodeEachItem() {
		const executionResult = await this.runCodeInPython<INodeExecutionData>();
		return this.validateRunCodeEachItem(executionResult);
	}

	private async runCodeInPython<T>() {
		// Below workaround from here:
		// https://github.com/pyodide/pyodide/discussions/3537#discussioncomment-4864345
		const runCode = `
from _pyodide_core import jsproxy_typedict
from js import Object
jsproxy_typedict[0] = type(Object.new().as_object_map())

if printOverwrite:
  print = printOverwrite

async def __main():
${this.pythonCode
	.split('\n')
	.map((line) => '  ' + line)
	.join('\n')}
await __main()
`;
		const pyodide = await LoadPyodide();

		const moduleImportsFiltered = this.moduleImports.filter(
			(importModule) => !['asyncio', 'pyodide', 'math'].includes(importModule),
		);

		if (moduleImportsFiltered.length) {
			await pyodide.loadPackage('micropip');
			const micropip = pyodide.pyimport('micropip');
			await Promise.all(
				moduleImportsFiltered.map((importModule) => micropip.install(importModule)),
			);
		}

		let executionResult;
		try {
			const dict = pyodide.globals.get('dict');
			const globalsDict = dict();
			for (const key in this.context) {
				if (key === '_env') continue; // Pyodide throws an error when setting this key
				const value = this.context[key];
				globalsDict.set(key, value);
			}

			executionResult = await pyodide.runPythonAsync(runCode, { globals: globalsDict });
			globalsDict.destroy();
		} catch (error) {
			throw this.getPrettyError(error as PyodideError);
		}

		if (executionResult?.toJs) {
			return executionResult.toJs({
				dict_converter: Object.fromEntries,
				create_proxies: false,
			}) as T;
		}

		return executionResult as T;
	}

	private getPrettyError(error: PyodideError): Error {
		const errorTypeIndex = error.message.indexOf(error.type);
		if (errorTypeIndex !== -1) {
			return new Error(error.message.slice(errorTypeIndex));
		}

		return error;
	}
}

export function getPythonSandboxContext(
	this: IExecuteFunctions,
	index: number,
): PythonSandboxContext {
	const item = this.getWorkflowDataProxy(index);

	return {
		// from NodeExecuteFunctions
		_getNodeParameter: this.getNodeParameter,
		_getWorkflowStaticData: this.getWorkflowStaticData,
		helpers: this.helpers,
		// TODO: automatically swap `$` with `_`
		_: item.$,
		_execution: item.$execution,
		_input: item.$input,
		_item: this.getWorkflowDataProxy,
		_items: item.$_items,
		_itemIndex: item.$itemIndex,
		_jmesPath: item.$jmesPath,
		_mode: item.$mode,
		_now: item.$now,
		_binary: item.$binary,
		_json: item.$json,
		_data: item.$data,
		_env: item.$env,
		_evaluateExpression: item.$evaluateExpression,
		_node: item.$node,
		_position: item.$position,
		_parameter: item.$parameter,
		_prevNode: item.$prevNode,
		_runIndex: item.$runIndex,
		_thisItem: item.$thisItem,
		_thisItemIndex: item.$thisItemIndex,
		_thisRunIndex: item.$thisRunIndex,
		_self: item.$self,
		_today: item.$today,
		_workflow: item.$workflow,
		DateTime: item.DateTime,
		Duration: item.Duration,
		Interval: item.Interval,
	};
}
