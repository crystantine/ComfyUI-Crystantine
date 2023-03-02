import { ComfyWidgets } from "./widgets.js";
import { api } from "./api.js";
import { defaultGraph } from "./defaultGraph.js";

class ComfyDialog {
	constructor() {
		this.element = document.createElement("div");
		this.element.classList.add("comfy-modal");

		const content = document.createElement("div");
		content.classList.add("comfy-modal-content");
		this.textElement = document.createElement("p");
		content.append(this.textElement);

		const closeBtn = document.createElement("button");
		closeBtn.type = "button";
		closeBtn.textContent = "CLOSE";
		content.append(closeBtn);
		closeBtn.onclick = () => this.close();

		this.element.append(content);
		document.body.append(this.element);
	}

	close() {
		this.element.style.display = "none";
	}

	show(html) {
		this.textElement.innerHTML = html;
		this.element.style.display = "flex";
	}
}

class ComfyQueue {
	constructor() {
		this.element = document.createElement("div");
	}

	async update() {
		if (this.element.style.display !== "none") {
			await this.load();
		}
	}

	async show() {
		this.element.style.display = "block";
		await this.load();
	}

	async load() {
		const queue = await api.getQueue();
	}

	hide() {
		this.element.style.display = "none";
	}
}


class ComfyUI {
	constructor(app) {
		this.app = app;
		this.menuContainer = document.createElement("div");
		this.menuContainer.classList.add("comfy-menu");
		document.body.append(this.menuContainer);

		this.dialog = new ComfyDialog();
		this.queue = new ComfyQueue();
	}
}

class ComfyApp {
	constructor() {
		this.ui = new ComfyUI(this);
		this.nodeOutputs = {};
		this.extensions = [
			{
				name: "TestExtension",
				init(app) {
					console.log("[ext:init]", app);
				},
				setup(app) {
					console.log("[ext:setup]", app);
				},
				addCustomNodeDefs(defs, app) {
					console.log("[ext:addCustomNodeDefs]", defs, app);
				},
				loadedGraphNode(node, app) {
					// console.log("[ext:loadedGraphNode]", node, app);
				},
				getCustomWidgets(app) {
					console.log("[ext:getCustomWidgets]", app);
					return {};
				},
				beforeRegisterNode(nodeType, nodeData, app) {
					// console.log("[ext:beforeRegisterNode]", nodeType, nodeData, app);
				},
				registerCustomNodes(app) {
					console.log("[ext:registerCustomNodes]", app);
				},
			},
		];
	}

	#log(message, ...other) {
		console.log("[comfy]", message, ...other);
	}

	#error(message, ...other) {
		console.error("[comfy]", message, ...other);
	}

	#invokeExtensions(method, ...args) {
		let results = [];
		for (const ext of this.extensions) {
			if (method in ext) {
				try {
					results.push(ext[method](...args, this));
				} catch (error) {
					this.#error(
						`Error calling extension '${ext.name}' method '${method}'`,
						{ error },
						{ extension: ext },
						{ args }
					);
				}
			}
		}
		return results;
	}

	async #invokeExtensionsAsync(method, ...args) {
		return await Promise.all(
			this.extensions.map(async (ext) => {
				if (method in ext) {
					try {
						return await ext[method](...args, this);
					} catch (error) {
						this.#error(
							`Error calling extension '${ext.name}' method '${method}'`,
							{ error },
							{ extension: ext },
							{ args }
						);
					}
				}
			})
		);
	}

	#addNodeContextMenuHandler(node) {
		node.prototype.getExtraMenuOptions = function (_, options) {
			if (this.imgs) {
				// If this node has images then we add an open in new tab item
				let img;
				if (this.imageIndex != null) {
					// An image is selected so select that
					img = this.imgs[this.imageIndex];
				} else if (this.overIndex != null) {
					// No image is selected but one is hovered
					img = this.imgs[this.overIndex];
				}
				if (img) {
					options.unshift({
						content: "Open Image",
						callback: () => window.open(img.src, "_blank"),
					});
				}
			}
		};
	}

	#addDrawBackgroundHandler(node) {
		const app = this;
		node.prototype.onDrawBackground = function (ctx) {
			if (!this.flags.collapsed) {
				const output = app.nodeOutputs[this.id + ""];
				if (output && output.images) {
					if (this.images !== output.images) {
						this.images = output.images;
						this.imgs = null;
						this.imageIndex = null;
						Promise.all(
							output.images.map((src) => {
								return new Promise((r) => {
									const img = new Image();
									img.onload = () => r(img);
									img.onerror = () => r(null);
									img.src = "/view/" + src;
								});
							})
						).then((imgs) => {
							if (this.images === output.images) {
								this.imgs = imgs.filter(Boolean);
								if (this.size[1] < 100) {
									this.size[1] = 250;
								}
								app.graph.setDirtyCanvas(true);
							}
						});
					}

					if (this.imgs) {
						const canvas = graph.list_of_graphcanvas[0];
						const mouse = canvas.graph_mouse;
						if (!canvas.pointer_is_down && this.pointerDown) {
							if (mouse[0] === this.pointerDown.pos[0] && mouse[1] === this.pointerDown.pos[1]) {
								this.imageIndex = this.pointerDown.index;
							}
							this.pointerDown = null;
						}

						let w = this.imgs[0].naturalWidth;
						let h = this.imgs[0].naturalHeight;
						let imageIndex = this.imageIndex;
						const numImages = this.imgs.length;
						if (numImages === 1 && !imageIndex) {
							this.imageIndex = imageIndex = 0;
						}
						let shiftY = this.type === "SaveImage" ? 55 : 0;
						let dw = this.size[0];
						let dh = this.size[1];
						dh -= shiftY;

						if (imageIndex == null) {
							let best = 0;
							let cellWidth;
							let cellHeight;
							let cols = 0;
							let shiftX = 0;
							for (let c = 1; c <= numImages; c++) {
								const rows = Math.ceil(numImages / c);
								const cW = dw / c;
								const cH = dh / rows;
								const scaleX = cW / w;
								const scaleY = cH / h;

								const scale = Math.min(scaleX, scaleY, 1);
								const imageW = w * scale;
								const imageH = h * scale;
								const area = imageW * imageH * numImages;

								if (area > best) {
									best = area;
									cellWidth = imageW;
									cellHeight = imageH;
									cols = c;
									shiftX = c * ((cW - imageW) / 2);
								}
							}

							let anyHovered = false;
							this.imageRects = [];
							for (let i = 0; i < numImages; i++) {
								const img = this.imgs[i];
								const row = Math.floor(i / cols);
								const col = i % cols;
								const x = col * cellWidth + shiftX;
								const y = row * cellHeight + shiftY;
								if (!anyHovered) {
									anyHovered = LiteGraph.isInsideRectangle(
										mouse[0],
										mouse[1],
										x + this.pos[0],
										y + this.pos[1],
										cellWidth,
										cellHeight
									);
									if (anyHovered) {
										this.overIndex = i;
										let value = 110;
										if (canvas.pointer_is_down) {
											if (!this.pointerDown || this.pointerDown.index !== i) {
												this.pointerDown = { index: i, pos: [...mouse] };
											}
											value = 125;
										}
										ctx.filter = `contrast(${value}%) brightness(${value}%)`;
										canvas.canvas.style.cursor = "pointer";
									}
								}
								this.imageRects.push([x, y, cellWidth, cellHeight]);
								ctx.drawImage(img, x, y, cellWidth, cellHeight);
								ctx.filter = "none";
							}

							if (!anyHovered) {
								this.pointerDown = null;
								this.overIndex = null;
							}
						} else {
							// Draw individual
							const scaleX = dw / w;
							const scaleY = dh / h;
							const scale = Math.min(scaleX, scaleY, 1);

							w *= scale;
							h *= scale;

							let x = (dw - w) / 2;
							let y = (dh - h) / 2 + shiftY;
							ctx.drawImage(this.imgs[imageIndex], x, y, w, h);

							const drawButton = (x, y, sz, text) => {
								const hovered = LiteGraph.isInsideRectangle(
									mouse[0],
									mouse[1],
									x + this.pos[0],
									y + this.pos[1],
									sz,
									sz
								);
								let fill = "#333";
								let textFill = "#fff";
								let isClicking = false;
								if (hovered) {
									canvas.canvas.style.cursor = "pointer";
									if (canvas.pointer_is_down) {
										fill = "#1e90ff";
										isClicking = true;
									} else {
										fill = "#eee";
										textFill = "#000";
									}
								} else {
									this.pointerWasDown = null;
								}

								ctx.fillStyle = fill;
								ctx.beginPath();
								ctx.roundRect(x, y, sz, sz, [4]);
								ctx.fill();
								ctx.fillStyle = textFill;
								ctx.font = "12px Arial";
								ctx.textAlign = "center";
								ctx.fillText(text, x + 15, y + 20);

								return isClicking;
							};

							if (numImages > 1) {
								if (drawButton(x + w - 35, y + h - 35, 30, `${this.imageIndex + 1}/${numImages}`)) {
									let i = this.imageIndex + 1 >= numImages ? 0 : this.imageIndex + 1;
									if (!this.pointerDown || !this.pointerDown.index === i) {
										this.pointerDown = { index: i, pos: [...mouse] };
									}
								}

								if (drawButton(x + w - 35, y + 5, 30, `x`)) {
									if (!this.pointerDown || !this.pointerDown.index === null) {
										this.pointerDown = { index: null, pos: [...mouse] };
									}
								}
							}
						}
					}
				}
			}
		};
	}

	/**
	 * Set up the app on the page
	 */
	async setup() {
		// Create and mount the LiteGraph in the DOM
		const canvasEl = Object.assign(document.createElement("canvas"), { id: "graph-canvas" });
		document.body.prepend(canvasEl);

		this.graph = new LGraph();
		const canvas = (this.canvas = new LGraphCanvas(canvasEl, this.graph));
		this.ctx = canvasEl.getContext("2d");

		this.graph.start();

		function resizeCanvas() {
			canvasEl.width = canvasEl.offsetWidth;
			canvasEl.height = canvasEl.offsetHeight;
			canvas.draw(true, true);
		}

		// Ensure the canvas fills the window
		resizeCanvas();
		window.addEventListener("resize", resizeCanvas);

		await this.#invokeExtensionsAsync("init");
		await this.registerNodes();

		// Load previous workflow
		let restored = false;
		try {
			const json = localStorage.getItem("workflow");
			if (json) {
				const workflow = JSON.parse(json);
				this.loadGraphData(workflow);
				restored = true;
			}
		} catch (err) {}

		// We failed to restore a workflow so load the default
		if (!restored) {
			this.loadGraphData(defaultGraph);
		}

		// Save current workflow automatically
		setInterval(() => localStorage.setItem("workflow", JSON.stringify(this.graph.serialize())), 1000);

		await this.#invokeExtensionsAsync("setup");
	}

	async registerNodes() {
		const app = this;
		// Load node definitions from the backend
		const defs = await api.getNodeDefs();
		await this.#invokeExtensionsAsync("addCustomNodeDefs", defs);

		// Generate list of known widgets
		const widgets = Object.assign(
			{},
			ComfyWidgets,
			...(await this.#invokeExtensionsAsync("getCustomWidgets")).filter(Boolean)
		);

		// Register a node for each definition
		for (const nodeId in defs) {
			const nodeData = defs[nodeId];
			const node = Object.assign(
				function ComfyNode() {
					const inputs = nodeData["input"]["required"];
					const config = { minWidth: 1, minHeight: 1 };
					for (const inputName in inputs) {
						const inputData = inputs[inputName];
						const type = inputData[0];

						if (Array.isArray(type)) {
							// Enums e.g. latent rotation
							this.addWidget("combo", inputName, type[0], () => {}, { values: type });
						} else if (`${type}:${inputName}` in widgets) {
							// Support custom widgets by Type:Name
							Object.assign(config, widgets[`${type}:${inputName}`](this, inputName, inputData, app) || {});
						} else if (type in widgets) {
							// Standard type widgets
							Object.assign(config, widgets[type](this, inputName, inputData, app) || {});
						} else {
							// Node connection inputs
							this.addInput(inputName, type);
						}
					}

					const s = this.computeSize();
					s[0] = Math.max(config.minWidth, s[0] * 1.5);
					s[1] = Math.max(config.minHeight, s[1]);
					this.size = s;
					this.serialize_widgets = true;
				},
				{
					title: nodeData.name,
					comfyClass: nodeData.name,
				}
			);
			node.prototype.comfyClass = nodeData.name;

			this.#addNodeContextMenuHandler(node);
			this.#addDrawBackgroundHandler(node, app);

			await this.#invokeExtensionsAsync("beforeRegisterNode", node, nodeData);
			LiteGraph.registerNodeType(nodeId, node);
			node.category = nodeData.category;
		}

		await this.#invokeExtensionsAsync("registerCustomNodes");
	}

	/**
	 * Populates the graph with the specified workflow data
	 * @param {*} graphData A serialized graph object
	 */
	loadGraphData(graphData) {
		this.graph.configure(graphData);

		for (const node of this.graph._nodes) {
			const size = node.computeSize();
			size[0] = Math.max(node.size[0], size[0]);
			size[1] = Math.max(node.size[1], size[1]);
			node.size = size;

			if (node.widgets) {
				// If you break something in the backend and want to patch workflows in the frontend
				// This is the place to do this
				for (let widget of node.widgets) {
					if (node.type == "KSampler" || node.type == "KSamplerAdvanced") {
						if (widget.name == "sampler_name") {
							if (widget.value.startsWith("sample_")) {
								wid.value = widget.value.slice(7);
							}
						}
					}
				}
			}

			this.#invokeExtensions("loadedGraphNode", node);
		}
	}

	graphToPrompt() {
		// TODO: Implement dynamic prompts
		const workflow = this.graph.serialize();
		const output = {};
		for (const n of workflow.nodes) {
			const inputs = {};
			const node = this.graph.getNodeById(n.id);
			const widgets = node.widgets;

			// Store all widget values
			if (widgets) {
				for (const widget of widgets) {
					if (widget.options.serialize !== false) {
						inputs[widget.name] = widget.value;
					}
				}
			}

			// Store all node links
			for (let i in node.inputs) {
				const link = node.getInputLink(i);
				if (link) {
					inputs[node.inputs[i].name] = [String(link.origin_id), parseInt(link.origin_slot)];
				}
			}

			output[String(node.id)] = {
				inputs,
				class_type: node.comfyClass,
			};
		}

		return { workflow, output };
	}

	async queuePrompt(number) {
		const p = this.graphToPrompt();

		try {
			await api.queuePrompt(number, p);
		} catch (error) {
			this.ui.dialog.show(error.response || error.toString());
			return;
		}

		for (const n of p.workflow.nodes) {
			const node = graph.getNodeById(n.id);
			if (node.widgets) {
				for (const widget of node.widgets) {
					// Allow widgets to run callbacks after a prompt has been queued
					// e.g. random seed after every gen
					if (widget.afterQueued) {
						widget.afterQueued();
					}
				}
			}
		}

		this.canvas.draw(true, true);
		await this.ui.queue.update();
	}
}

export const app = new ComfyApp();