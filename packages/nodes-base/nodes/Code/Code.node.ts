import type {
	CodeExecutionMode,
	CodeNodeEditorLanguage,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getJavaScriptSandboxContext, JavaScriptSandbox } from './JavaScriptSandbox';
import { getPythonSandboxContext, PythonSandbox } from './PythonSandbox';
import { javascriptCodeDescription } from './descriptions/JavascriptCodeDescription';
import { pythonCodeDescription } from './descriptions/PythonCodeDescription';
import { standardizeOutput } from './utils';

export class Code implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Code',
		name: 'code',
		icon: 'fa:code',
		group: ['transform'],
		version: [1, 2],
		defaultVersion: 1,
		description: 'Run custom JavaScript code',
		defaults: {
			name: 'Code',
			color: '#FF9922',
		},
		inputs: ['main'],
		outputs: ['main'],
		parameterPane: 'wide',
		properties: [
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Run Once for All Items',
						value: 'runOnceForAllItems',
						description: 'Run this code only once, no matter how many input items there are',
					},
					{
						name: 'Run Once for Each Item',
						value: 'runOnceForEachItem',
						description: 'Run this code as many times as there are input items',
					},
				],
				default: 'runOnceForAllItems',
			},
			{
				displayName: 'Language',
				name: 'language',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						'@version': [2],
					},
				},
				options: [
					{
						name: 'JavaScript',
						value: 'javaScript',
					},
					{
						name: 'Python (Beta)',
						value: 'python',
					},
				],
				default: 'javaScript',
			},

			...javascriptCodeDescription,
			...pythonCodeDescription,
		],
	};

	async execute(this: IExecuteFunctions) {
		const nodeMode = this.getNodeParameter<CodeExecutionMode>('mode', 0);
		const workflowMode = this.getMode();

		const language: CodeNodeEditorLanguage =
			this.getNode()?.typeVersion === 2 ? this.getNodeParameter('language', 0) : 'javaScript';
		const codeParameterName = language === 'python' ? 'pythonCode' : 'jsCode';

		const getSandbox = (index = 0) => {
			const code = this.getNodeParameter<string>(codeParameterName, index);
			if (language === 'python') {
				const context = getPythonSandboxContext.call(this, index);
				const modules = this.getNodeParameter<string>('modules', index);
				const moduleImports: string[] = modules ? modules.split(',').map((m) => m.trim()) : [];
				context.printOverwrite = workflowMode === 'manual' ? this.sendMessageToUI : null;
				return new PythonSandbox(context, code, moduleImports, index, this.helpers);
			} else {
				const context = getJavaScriptSandboxContext.call(this, index);
				context.items = context.$input.all();
				const sandbox = new JavaScriptSandbox(context, code, index, workflowMode, this.helpers);
				if (workflowMode === 'manual') {
					sandbox.vm.on('console.log', this.sendMessageToUI);
				}
				return sandbox;
			}
		};

		// ----------------------------------
		//        runOnceForAllItems
		// ----------------------------------

		if (nodeMode === 'runOnceForAllItems') {
			const sandbox = getSandbox();
			let items: INodeExecutionData[];
			try {
				items = await sandbox.runCodeAllItems();
			} catch (error) {
				if (!this.continueOnFail()) throw error;
				items = [{ json: { error: error.message } }];
			}

			items.forEach(({ json }) => standardizeOutput(json));

			return this.prepareOutputData(items);
		}

		// ----------------------------------
		//        runOnceForEachItem
		// ----------------------------------

		const returnData: INodeExecutionData[] = [];

		const items = this.getInputData();

		for (let index = 0; index < items.length; index++) {
			const sandbox = getSandbox(index);
			let result: INodeExecutionData | undefined;
			try {
				result = await sandbox.runCodeEachItem();
			} catch (error) {
				if (!this.continueOnFail()) throw error;
				returnData.push({ json: { error: error.message } });
			}

			if (result) {
				returnData.push({
					json: standardizeOutput(result.json),
					pairedItem: { item: index },
					...(result.binary && { binary: result.binary }),
				});
			}
		}

		return this.prepareOutputData(returnData);
	}
}
