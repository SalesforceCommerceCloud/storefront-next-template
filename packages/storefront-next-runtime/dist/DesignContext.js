import { n as createClientApi } from "./messaging-api.js";
import { i as usePageDesignerMode, n as useDesignContext, t as DesignContext } from "./DesignContext2.js";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx } from "react/jsx-runtime";

//#region src/design/react/context/designStore.ts
function createDesignStore(initial) {
	let snapshot = initial;
	const listeners = /* @__PURE__ */ new Set();
	return {
		getSnapshot: () => snapshot,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setState: (next) => {
			if (next === snapshot) return;
			snapshot = next;
			listeners.forEach((listener) => listener());
		}
	};
}

//#endregion
//#region src/design/react/context/DesignStoreContext.ts
/**
* Carries the external design-state store to consumers via `useDesignSelector`.
* Runs alongside `DesignStateContext`, which remains the write-side source of
* truth that the store mirrors.
*/
const DesignStoreContext = React.createContext(null);

//#endregion
//#region src/design/react/hooks/useInteraction.ts
/**
* Base hook that provides common interaction patterns for design-time functionality.
* Reduces boilerplate by handling state management, event listeners, and cleanup.
*
* @param config - Configuration object defining the interaction behavior
* @returns Object containing state and action methods
*/
function useInteraction(config) {
	const [state, setState] = useState(config.initialState);
	const { isDesignMode, clientApi } = useDesignContext() ?? {};
	const stateRef = useRef(state);
	stateRef.current = state;
	const clientApiRef = useRef(clientApi ?? null);
	clientApiRef.current = clientApi ?? null;
	const actionsFactoryRef = useRef(config.actions);
	actionsFactoryRef.current = config.actions;
	const eventHandlersRef = useRef(config.eventHandlers);
	eventHandlersRef.current = config.eventHandlers;
	useEffect(() => {
		if (!isDesignMode || !clientApi) return () => {};
		const unsubscribeFunctions = Object.keys(eventHandlersRef.current ?? {}).map((eventName) => clientApi.on(eventName, (event) => eventHandlersRef.current?.[eventName]?.handler(event, setState)));
		return () => {
			unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
		};
	}, [isDesignMode, clientApi]);
	const stableActionsRef = useRef(null);
	if (stableActionsRef.current === null && config.actions) {
		const initialActions = config.actions(stateRef.current, setState, clientApiRef.current);
		const wrapped = {};
		for (const key of Object.keys(initialActions)) wrapped[key] = (...args) => actionsFactoryRef.current?.(stateRef.current, setState, clientApiRef.current)[key](...args);
		stableActionsRef.current = wrapped;
	}
	return useMemo(() => ({
		state,
		...stableActionsRef.current
	}), [state]);
}

//#endregion
//#region src/design/react/utils/isValueChanged.ts
/**
* Copyright 2026 Salesforce, Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
/**
* Shallow, by-value inequality check for two plain-object maps.
*
* Returns `true` when the objects differ by key count or by any top-level
* value reference, `false` when they are shallowly equal.
*/
function isValueChanged(obj1, obj2) {
	if (Object.is(obj1, obj2)) return false;
	if (Array.isArray(obj1)) {
		if (Array.isArray(obj2)) return obj1.length !== obj2.length || obj1.some((value, index) => !Object.is(value, obj2[index]));
		return true;
	}
	if (typeof obj1 === "object" && obj1 !== null && typeof obj2 === "object" && obj2 !== null) return Object.keys(obj1).length !== Object.keys(obj2).length || Object.entries(obj1).some(([key, value]) => !Object.is(value, obj2?.[key]));
	return true;
}

//#endregion
//#region src/design/react/hooks/useMemoObject.ts
function useMemoObject(obj) {
	const objRef = useRef(null);
	if (!objRef.current || isValueChanged(objRef.current, obj)) objRef.current = obj;
	return objRef.current;
}

//#endregion
//#region src/design/react/hooks/useSelectInteraction.ts
/**
* Custom hook that manages component selection state and handles
* client-host communication for selection events.
*
* @returns Selection state and interaction methods
*/
function useSelectInteraction({ contentLinkMap }) {
	const { state: selectedContentLinkUuid, setSelectedComponent } = useInteraction({
		initialState: "",
		eventHandlers: {
			ComponentSelected: { handler: (event, setState) => {
				setState(event.contentLinkUuid);
			} },
			ComponentDeselected: { handler: (_, setState) => {
				setState("");
			} }
		},
		actions: (_state, setState, clientApi) => ({ setSelectedComponent: (contentLinkUuid) => {
			setState(contentLinkUuid);
			clientApi?.selectComponent({
				componentId: contentLinkMap[contentLinkUuid] ?? "",
				contentLinkUuid
			});
		} })
	});
	return useMemoObject({
		selectedContentLinkUuid,
		setSelectedComponent
	});
}

//#endregion
//#region src/design/react/hooks/useHoverInteraction.ts
/**
* Custom hook that manages component hover state and handles
* client-host communication for hover events.
*
* @returns Hover state and interaction methods
*/
function useHoverInteraction({ contentLinkMap }) {
	const { state: hoveredContentLinkUuid, setHoveredComponent } = useInteraction({
		initialState: null,
		eventHandlers: {
			ComponentHoveredIn: { handler: (event, setState) => setState(event.contentLinkUuid) },
			ComponentHoveredOut: { handler: (_, setState) => setState(null) }
		},
		actions: (state, setState, clientApi) => ({ setHoveredComponent: (componentUuid) => {
			if (state && componentUuid !== state) clientApi?.hoverOutOfComponent({
				componentId: contentLinkMap[state] ?? state,
				contentLinkUuid: state
			});
			if (componentUuid && componentUuid !== state) clientApi?.hoverInToComponent({
				componentId: contentLinkMap[componentUuid] ?? null,
				contentLinkUuid: componentUuid
			});
			setState(componentUuid);
		} })
	});
	return useMemoObject({
		hoveredContentLinkUuid,
		setHoveredComponent
	});
}

//#endregion
//#region src/design/react/hooks/useDeleteInteraction.ts
function useDeleteInteraction({ selectedContentLinkUuid, setSelectedComponent }) {
	const { deleteComponent } = useInteraction({
		initialState: null,
		eventHandlers: {},
		actions: (_state, _setState, clientApi) => ({ deleteComponent: (event) => {
			clientApi?.deleteComponent(event);
			if (selectedContentLinkUuid === event.contentLinkUuid) setSelectedComponent("");
		} })
	});
	return useMemoObject({ deleteComponent });
}

//#endregion
//#region src/design/react/hooks/useFocusInteraction.ts
function useFocusInteraction({ setSelectedComponent }) {
	const { state: focusedContentLinkUuid, focusComponent } = useInteraction({
		initialState: null,
		eventHandlers: { ComponentFocused: { handler: (event, setState) => {
			setSelectedComponent("");
			setState(event.contentLinkUuid);
		} } },
		actions: (_state, setState) => ({ focusComponent: (node) => {
			node.scrollIntoView();
			setState(null);
		} })
	});
	return useMemoObject({
		focusedContentLinkUuid,
		focusComponent
	});
}

//#endregion
//#region src/design/react/hooks/useScrollInteraction.ts
/**
* Custom hook that manages component hover state and handles
* client-host communication for hover events.
*
* @returns Hover state and interaction methods
*/
function useScrollInteraction() {
	const { notifyWindowScrollChange } = useInteraction({
		initialState: null,
		eventHandlers: { WindowScrollChanged: { handler: (event) => {
			if (event.scrollY != null) window.scrollTo({
				behavior: "instant",
				top: event.scrollY
			});
		} } },
		actions: (_state, _setState, clientApi) => ({ notifyWindowScrollChange: (x, y) => {
			clientApi?.notifyWindowScrollChanged({
				scrollX: x,
				scrollY: y
			});
		} })
	});
	return useMemoObject({ notifyWindowScrollChange });
}

//#endregion
//#region src/design/react/hooks/useComponentDiscovery.ts
/**
* Returns a utility for discovering components and regions at a given
* x, y coordinates.
* @param nodeToTargetMap - The map of nodes to target entries.
*/
function useComponentDiscovery({ nodeToTargetMap }) {
	return useCallback(({ x, y, filter = () => true }) => {
		const nodeStack = document.elementsFromPoint(x, y);
		const results = [];
		for (let i = 0; i < nodeStack.length; i += 1) {
			const node = nodeStack[i];
			const entry = nodeToTargetMap.get(node);
			if (entry && filter(entry)) results.push({
				...entry,
				node
			});
		}
		return results;
	}, [nodeToTargetMap]);
}

//#endregion
//#region src/design/react/utils/regionUtils.ts
/**
* Copyright 2026 Salesforce, Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
/**
* Checks if a component type is allowed in a region based on inclusion and exclusion rules.
*
* @param componentType - The type of component being checked
* @param componentTypeInclusions - Array of allowed component types (if empty, all types are allowed by default)
* @param componentTypeExclusions - Array of forbidden component types
* @returns true if the component type is allowed, false otherwise
*/
function isComponentTypeAllowedInRegion(componentType, componentTypeInclusions, componentTypeExclusions) {
	if (!componentType) return false;
	if (componentTypeExclusions?.includes(componentType)) return false;
	if (componentTypeInclusions?.length > 0) return componentTypeInclusions.includes(componentType);
	return true;
}

//#endregion
//#region src/design/react/hooks/useDragInteraction.ts
const SCROLL_BUFFER_HEIGHT_PERCENTAGE = 15;
const SCROLL_BUFFER_MIN_HEIGHT_IN_PIXELS = 50;
const SCROLL_INTERVAL_IN_MS = 1e3 / 60;
const SCROLL_BASE_AMOUNT_IN_PIXELS = 50;
function getInsertionType({ cache, node, x, y }) {
	if (!cache.has(node)) {
		const rect$1 = node.getBoundingClientRect();
		const screenLeft = rect$1.left - window.scrollX;
		const screenTop = rect$1.top + window.scrollY;
		cache.set(node, new DOMRect(screenLeft, screenTop, rect$1.width, rect$1.height));
	}
	const rect = cache.get(node);
	const screenX = x + window.scrollX;
	const screenY = y + window.scrollY;
	const midX = rect.left + rect.width / 2;
	const midY = rect.top + rect.height / 2;
	const deltaX = screenX - midX;
	const deltaY = screenY - midY;
	const relativeDeltaX = deltaX / (rect.width / 2);
	const relativeDeltaY = deltaY / (rect.height / 2);
	if (Math.abs(relativeDeltaX) > Math.abs(relativeDeltaY)) return {
		axis: "x",
		type: relativeDeltaX < 0 ? "before" : "after"
	};
	return {
		axis: "y",
		type: relativeDeltaY < 0 ? "before" : "after"
	};
}
function isOnSelfDropTarget({ sourceContentLinkUuid, beforeContentLinkUuid, afterContentLinkUuid, insertType, contentLinkUuid }) {
	const isOnSource = sourceContentLinkUuid && contentLinkUuid === sourceContentLinkUuid;
	const isOnSameRegionBefore = sourceContentLinkUuid && insertType.type === "before" && beforeContentLinkUuid === sourceContentLinkUuid;
	const isOnSameRegionAfter = sourceContentLinkUuid && insertType.type === "after" && afterContentLinkUuid === sourceContentLinkUuid;
	return isOnSource || isOnSameRegionBefore || isOnSameRegionAfter;
}
function useDragInteraction({ nodeToTargetMap }) {
	const discoverComponents = useComponentDiscovery({ nodeToTargetMap });
	const getNearestComponentAndRegion = useCallback((x, y) => {
		const stack = discoverComponents({
			x,
			y
		});
		let component = null;
		let region = null;
		for (let i = 0; i < stack.length; i += 1) {
			const entry = stack[i];
			if (entry.regionId) {
				if (entry.type === "component") component = entry;
				else if (entry.type === "region") {
					region = entry;
					break;
				}
			}
		}
		return {
			component,
			region
		};
	}, [discoverComponents]);
	const getInsertionComponentUuids = (contentLinkUuid, region) => {
		const componentIndex = region.contentLinkUuids.indexOf(contentLinkUuid);
		return [region.contentLinkUuids[componentIndex - 1], region.contentLinkUuids[componentIndex + 1]];
	};
	const getCurrentDropTarget = useCallback(({ x, y, rectCache, componentType }) => {
		const { component, region } = getNearestComponentAndRegion(x, y);
		if (region) {
			if (!isComponentTypeAllowedInRegion(componentType, region.componentTypeInclusions || [], region.componentTypeExclusions || [])) return null;
			const insertType = component ? getInsertionType({
				cache: rectCache,
				node: component.node,
				x,
				y
			}) : {
				axis: "y",
				type: "after"
			};
			const componentContentLinkUuid = component?.contentLinkUuid ?? "";
			const [beforeContentLinkUuid, afterContentLinkUuid] = component ? getInsertionComponentUuids(componentContentLinkUuid, region) : [];
			return {
				type: component ? "component" : "region",
				regionId: region.regionId,
				componentId: component?.componentId ?? "",
				contentLinkUuid: componentContentLinkUuid,
				parentId: region.parentId,
				beforeContentLinkUuid,
				afterContentLinkUuid,
				insertContentLinkUuid: componentContentLinkUuid,
				insertType,
				componentTypeInclusions: region.componentTypeInclusions,
				componentTypeExclusions: region.componentTypeExclusions
			};
		}
		return null;
	}, [getNearestComponentAndRegion]);
	const computeScrollFactor = ({ y, windowHeight }) => {
		const bufferHeight = Math.max(windowHeight * (SCROLL_BUFFER_HEIGHT_PERCENTAGE / 100), SCROLL_BUFFER_MIN_HEIGHT_IN_PIXELS);
		const bottomBufferStart = windowHeight - bufferHeight;
		if (y > bottomBufferStart) return (y - bottomBufferStart) / bufferHeight;
		if (y < bufferHeight) return (y - bufferHeight) / bufferHeight;
		return 0;
	};
	const computeScrollDirection = (factor) => {
		if (factor > 0) return 1;
		if (factor < 0) return -1;
		return 0;
	};
	const scrollFactorRef = useRef(0);
	const { state: dragState, commitCurrentDropTarget, updateComponentMove, startComponentMove, dropComponent, cancelDrag, setPendingDragContentLinkUuid } = useInteraction({
		initialState: {
			isDragging: false,
			componentType: "",
			fragmentId: void 0,
			sourceContentLinkUuid: void 0,
			sourceRegionId: void 0,
			x: 0,
			y: 0,
			currentDropTarget: null,
			pendingTargetCommit: false,
			rectCache: /* @__PURE__ */ new WeakMap(),
			pendingDragContentLinkUuid: null
		},
		eventHandlers: {
			ComponentDragStarted: { handler: (event, setState) => {
				scrollFactorRef.current = 0;
				setState((prevState) => ({
					...prevState,
					componentType: event.componentType,
					fragmentId: event.fragmentId,
					sourceContentLinkUuid: void 0,
					sourceRegionId: void 0,
					x: 0,
					y: 0,
					isDragging: true,
					currentDropTarget: null,
					pendingTargetCommit: false,
					scrollDirection: 0,
					rectCache: /* @__PURE__ */ new WeakMap()
				}));
			} },
			ClientWindowDragExited: { handler: (_, setState) => {
				scrollFactorRef.current = 0;
				setState((prevState) => ({
					...prevState,
					componentType: "",
					x: 0,
					y: 0,
					isDragging: false,
					currentDropTarget: null,
					scrollDirection: 0,
					pendingTargetCommit: false
				}));
			} },
			ClientWindowDragMoved: { handler: (event, setState) => {
				scrollFactorRef.current = computeScrollFactor({
					y: event.y,
					windowHeight: window.innerHeight
				});
				setState((prevState) => ({
					...prevState,
					x: event.x,
					y: event.y,
					isDragging: true,
					scrollDirection: computeScrollDirection(scrollFactorRef.current),
					currentDropTarget: getCurrentDropTarget({
						x: event.x,
						y: event.y,
						rectCache: dragState.rectCache,
						componentType: prevState.componentType
					})
				}));
			} },
			ClientWindowDragDropped: { handler: (_, setState) => {
				setState((prevState) => ({
					...prevState,
					isDragging: false,
					pendingTargetCommit: true
				}));
			} }
		},
		actions: (state, setState, clientApi) => ({
			cancelDrag: () => {
				scrollFactorRef.current = 0;
				setState((prevState) => ({
					...prevState,
					x: 0,
					y: 0,
					scrollDirection: 0,
					isDragging: false,
					pendingDragContentLinkUuid: null
				}));
			},
			updateComponentMove: ({ x, y }) => {
				scrollFactorRef.current = computeScrollFactor({
					y,
					windowHeight: window.innerHeight
				});
				setState((prevState) => ({
					...prevState,
					x,
					y,
					scrollDirection: computeScrollDirection(scrollFactorRef.current),
					currentDropTarget: getCurrentDropTarget({
						x,
						y,
						rectCache: state.rectCache,
						componentType: state.componentType
					})
				}));
			},
			setPendingDragContentLinkUuid: (contentLinkUuid) => {
				setState((prevState) => ({
					...prevState,
					pendingDragContentLinkUuid: contentLinkUuid
				}));
			},
			dropComponent: () => {
				setState((prevState) => ({
					...prevState,
					isDragging: false,
					pendingTargetCommit: true
				}));
			},
			startComponentMove: (componentId, regionId, componentType, contentLinkUuid) => {
				scrollFactorRef.current = 0;
				setState((prevState) => ({
					...prevState,
					x: 0,
					y: 0,
					componentType,
					sourceContentLinkUuid: contentLinkUuid,
					sourceRegionId: regionId,
					isDragging: true,
					scrollDirection: 0,
					rectCache: /* @__PURE__ */ new WeakMap()
				}));
			},
			commitCurrentDropTarget: () => {
				if (state.currentDropTarget) {
					if (state.sourceContentLinkUuid) {
						if (!isOnSelfDropTarget({
							sourceContentLinkUuid: state.sourceContentLinkUuid,
							beforeContentLinkUuid: state.currentDropTarget.beforeContentLinkUuid,
							afterContentLinkUuid: state.currentDropTarget.afterContentLinkUuid,
							insertType: state.currentDropTarget.insertType,
							contentLinkUuid: state.currentDropTarget.contentLinkUuid ?? ""
						})) clientApi?.moveComponentToRegion({
							componentId: state.currentDropTarget.componentId ?? "",
							contentLinkUuid: state.sourceContentLinkUuid,
							sourceRegionId: state.sourceRegionId ?? "",
							insertType: state.currentDropTarget.insertType?.type,
							insertComponentId: state.currentDropTarget.insertContentLinkUuid,
							beforeComponentId: state.currentDropTarget.beforeContentLinkUuid,
							afterComponentId: state.currentDropTarget.afterContentLinkUuid,
							targetRegionId: state.currentDropTarget.regionId,
							targetComponentId: state.currentDropTarget.parentId ?? ""
						});
					} else if (state.componentType || state.fragmentId) clientApi?.addComponentToRegion({
						insertType: state.currentDropTarget.insertType?.type,
						insertComponentId: state.currentDropTarget.insertContentLinkUuid,
						beforeComponentId: state.currentDropTarget.beforeContentLinkUuid,
						componentProperties: {},
						componentType: state.fragmentId ? "" : state.componentType ?? "",
						fragmentId: state.fragmentId,
						targetComponentId: state.currentDropTarget.parentId ?? "",
						afterComponentId: state.currentDropTarget.afterContentLinkUuid,
						targetRegionId: state.currentDropTarget.regionId
					});
				}
				scrollFactorRef.current = 0;
				setState((prevState) => ({
					...prevState,
					x: 0,
					y: 0,
					componentType: "",
					scrollDirection: 0,
					sourceContentLinkUuid: void 0,
					sourceRegionId: void 0,
					pendingDragContentLinkUuid: null,
					currentDropTarget: null,
					pendingTargetCommit: false
				}));
			}
		})
	});
	useEffect(() => {
		if (dragState.pendingTargetCommit) commitCurrentDropTarget();
	}, [dragState.pendingTargetCommit, commitCurrentDropTarget]);
	useEffect(() => {
		if (dragState.scrollDirection !== 0) {
			const interval = setInterval(() => {
				window.scrollBy(0, scrollFactorRef.current * SCROLL_BASE_AMOUNT_IN_PIXELS);
			}, SCROLL_INTERVAL_IN_MS);
			return () => clearInterval(interval);
		}
		return () => {};
	}, [dragState.scrollDirection, scrollFactorRef]);
	return useMemoObject({
		dragState,
		setPendingDragContentLinkUuid,
		commitCurrentDropTarget,
		startComponentMove,
		updateComponentMove,
		dropComponent,
		cancelDrag
	});
}

//#endregion
//#region src/design/react/hooks/useComponentUpdateInteraction.ts
function getComponentUpdatesFromComponents(components, seed = {}) {
	return Object.entries(components).reduce((acc, [id, componentInfo]) => {
		acc[id] = {};
		if (componentInfo.name) acc[id].name = seed[id]?.name ?? componentInfo.name;
		if (componentInfo.properties) acc[id].properties = {
			...componentInfo.properties,
			...seed[id]?.properties
		};
		if (componentInfo.visibility) acc[id].visibility = seed[id]?.visibility ?? componentInfo.visibility;
		return acc;
	}, {});
}
/**
* Custom hook that manages component update state and handles
* client-host communication for component update events.
*
* Listens for ComponentUpdated events from the host and maintains
* a map of component IDs to their updated data.
*
* @returns Component update state
*/
function useComponentUpdateInteraction() {
	const { state: componentUpdates } = useInteraction({
		initialState: {},
		eventHandlers: {
			ClientConfigurationChanged: { handler: (event, setState) => {
				setState((prev) => event.changeType === "replace" ? getComponentUpdatesFromComponents(event.components) : getComponentUpdatesFromComponents(event.components, prev));
			} },
			ClientAcknowledged: { handler: (event, setState) => {
				setState(getComponentUpdatesFromComponents(event.components));
			} },
			ComponentReset: { handler: (event, setState) => {
				setState((prev) => {
					if (!prev[event.componentId]) return prev;
					if (!event.changeTypes) {
						const remainingUpdates = { ...prev };
						delete remainingUpdates[event.componentId];
						return remainingUpdates;
					}
					const updatedComponent = { ...prev[event.componentId] };
					event.changeTypes.forEach((type) => delete updatedComponent[type]);
					return {
						...prev,
						[event.componentId]: updatedComponent
					};
				});
			} },
			ComponentUpdated: { handler: (event, setState) => {
				setState((prev) => {
					const componentId = event.componentId;
					const updated = { ...prev[componentId] || {} };
					switch (event.changeType) {
						case "name":
							updated.name = event.newValue;
							break;
						case "visibility":
							updated.visibility = event.newValue;
							break;
						default: break;
					}
					return {
						...prev,
						[componentId]: updated
					};
				});
			} },
			ComponentPropertiesChanged: { handler: (event, setState) => {
				if (!event.properties) return;
				setState((prev) => {
					const changeType = event.changeType ?? "partial";
					const componentId = event.componentId;
					const existing = prev[componentId] || {};
					let basisProperties;
					let isUnchanged = true;
					if (changeType === "partial") {
						basisProperties = existing.properties;
						isUnchanged = Object.entries(event.properties).every(([key, value]) => Object.is(value, basisProperties?.[key]));
					} else isUnchanged = false;
					if (isUnchanged) return prev;
					const mergedProperties = {
						...basisProperties,
						...event.properties
					};
					return {
						...prev,
						[componentId]: {
							...existing,
							properties: mergedProperties
						}
					};
				});
			} }
		}
	});
	return useMemoObject({ componentUpdates });
}

//#endregion
//#region src/design/react/context/DesignStateContext.tsx
const DesignStateContext = React.createContext(null);
const DesignStateProvider = ({ children }) => {
	const [contentLinkMap, setContentLinkMap] = React.useState({});
	const registerContentLink = React.useCallback((contentLinkUuid, componentId) => {
		setContentLinkMap((prev) => {
			if (prev[contentLinkUuid] === componentId) return prev;
			return {
				...prev,
				[contentLinkUuid]: componentId
			};
		});
	}, []);
	const selectInteraction = useSelectInteraction({ contentLinkMap });
	const hoverInteraction = useHoverInteraction({ contentLinkMap });
	const deleteInteraction = useDeleteInteraction({
		selectedContentLinkUuid: selectInteraction.selectedContentLinkUuid,
		setSelectedComponent: selectInteraction.setSelectedComponent
	});
	const focusInteraction = useFocusInteraction({ setSelectedComponent: selectInteraction.setSelectedComponent });
	const scrollInteraction = useScrollInteraction();
	const componentUpdateInteraction = useComponentUpdateInteraction();
	const nodeToTargetMap = React.useMemo(() => /* @__PURE__ */ new WeakMap(), []);
	const dragInteraction = useDragInteraction({ nodeToTargetMap });
	const state = React.useMemo(() => ({
		...deleteInteraction,
		...selectInteraction,
		...hoverInteraction,
		...focusInteraction,
		...dragInteraction,
		...scrollInteraction,
		...componentUpdateInteraction,
		nodeToTargetMap,
		contentLinkMap,
		registerContentLink
	}), [
		deleteInteraction,
		selectInteraction,
		hoverInteraction,
		focusInteraction,
		dragInteraction,
		nodeToTargetMap,
		scrollInteraction,
		componentUpdateInteraction,
		contentLinkMap,
		registerContentLink
	]);
	const storeRef = React.useRef(null);
	if (!storeRef.current) storeRef.current = createDesignStore(state);
	React.useLayoutEffect(() => {
		storeRef.current?.setState(state);
	}, [state]);
	return /* @__PURE__ */ jsx(DesignStoreContext.Provider, {
		value: storeRef.current,
		children: /* @__PURE__ */ jsx(DesignStateContext.Provider, {
			value: state,
			children
		})
	});
};

//#endregion
//#region src/design/react/hooks/useThrottledCallback.ts
function useThrottledCallback(callback, interval, deps = []) {
	const lastCallTime = useRef(0);
	return useCallback((...args) => {
		const now = Date.now();
		if (now >= lastCallTime.current + interval) {
			lastCallTime.current = now;
			callback(...args);
		}
	}, [
		callback,
		interval,
		...deps
	]);
}

//#endregion
//#region src/design/react/hooks/useDebouncedCallback.ts
function useDebouncedCallback(callback, interval, deps = []) {
	const timeoutRef = useRef(null);
	return useCallback((...args) => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
		timeoutRef.current = setTimeout(() => {
			callback(...args);
			timeoutRef.current = null;
		}, interval);
	}, [
		callback,
		interval,
		...deps
	]);
}

//#endregion
//#region src/design/react/hooks/useDesignSelector.ts
/**
* Subscribe to a slice of design state; re-render only when that slice changes
* per the equality function (default `Object.is`).
*
* The `useSyncExternalStore` selector overload is intentionally not used because
* it re-runs the selector on every store change and compares results with
* `Object.is` only — a selector that derives a NEW object (e.g. a merged props
* bag) would loop forever. Instead we cache the last selected value in a ref and
* only publish a new value when `isEqual` reports a real change, so derived
* objects are safe.
*/
function useDesignSelector(selector, isEqual = Object.is) {
	const store = React.useContext(DesignStoreContext);
	if (!store) throw new Error("useDesignSelector must be used within a DesignStateProvider");
	const selectorRef = React.useRef(selector);
	const isEqualRef = React.useRef(isEqual);
	selectorRef.current = selector;
	isEqualRef.current = isEqual;
	const lastSelectedRef = React.useRef(null);
	const getSelectedSnapshot = React.useCallback(() => {
		const selected = selectorRef.current(store.getSnapshot());
		const cached = lastSelectedRef.current;
		if (cached && isEqualRef.current(cached.value, selected)) return cached.value;
		lastSelectedRef.current = { value: selected };
		return selected;
	}, [store]);
	return React.useSyncExternalStore(store.subscribe, getSelectedSnapshot, getSelectedSnapshot);
}

//#endregion
//#region src/design/react/hooks/useGlobalListeners.ts
const FPS_60 = 1e3 / 60;
function useGlobalListeners() {
	const dropComponent = useDesignSelector((s) => s.dropComponent);
	const updateComponentMove = useDesignSelector((s) => s.updateComponentMove);
	const cancelDrag = useDesignSelector((s) => s.cancelDrag);
	const notifyWindowScrollChange = useDesignSelector((s) => s.notifyWindowScrollChange);
	const dragListener = useThrottledCallback((event) => updateComponentMove({
		x: event.clientX,
		y: event.clientY
	}), FPS_60, [updateComponentMove]);
	const scrollListener = useDebouncedCallback(() => notifyWindowScrollChange(window.scrollX, window.scrollY), 100, [notifyWindowScrollChange]);
	useEffect(() => {
		const dragEndListener = () => dropComponent();
		const mouseUpListener = () => cancelDrag();
		window.addEventListener("dragover", dragListener);
		window.addEventListener("dragend", dragEndListener);
		window.addEventListener("scroll", scrollListener);
		window.addEventListener("mouseup", mouseUpListener);
		return () => {
			window.removeEventListener("dragover", dragListener);
			window.removeEventListener("dragend", dragEndListener);
			window.removeEventListener("mouseup", mouseUpListener);
			window.removeEventListener("scroll", scrollListener);
		};
	}, [
		dropComponent,
		cancelDrag,
		dragListener,
		scrollListener
	]);
}

//#endregion
//#region src/design/react/hooks/useGlobalAnchorBlock.ts
/**
* React hook that prevents all <a> (anchor) navigation by default in the document,
* unless the anchor has the attribute `data-pd-allow-link`.
*/
function useGlobalAnchorBlock() {
	useEffect(() => {
		function preventAnchorClicks(event) {
			const anchor = event.target.closest("a");
			if (anchor && !anchor.hasAttribute("data-pd-allow-link")) event.preventDefault();
		}
		document.addEventListener("click", preventAnchorClicks);
		return () => document.removeEventListener("click", preventAnchorClicks);
	}, []);
}

//#endregion
//#region src/design/react/components/DesignApp.tsx
/**
* Containes any global setup logic for the design layer.
*/
const DesignApp = ({ children }) => {
	useGlobalListeners();
	useGlobalAnchorBlock();
	return /* @__PURE__ */ jsx(Fragment, { children });
};

//#endregion
//#region src/design/react/context/DesignContext.tsx
const noop = () => {};
/**
* Provider component that enables design-time functionality for child components.
* Sets up client-host communication and manages component selection state.
*
* @param children - Child components to wrap with design functionality
* @param targetOrigin - Target origin for postMessage communication
* @param clientId - Id for the client API
* @returns JSX element wrapping children with design context
*/
const DesignProvider = ({ children, targetOrigin, clientId, usid, clientConnectionTimeout, clientConnectionInterval, pageUpdateMode = "server", clientLogger = noop }) => {
	const { isDesignMode } = usePageDesignerMode();
	const [isConnected, setIsConnected] = React.useState(false);
	const [pageDesignerConfig, setPageDesignerConfig] = React.useState(null);
	const [clientPage, setClientPage] = React.useState(null);
	const clientPageRef = React.useRef(null);
	const clientApi = React.useMemo(() => createClientApi({
		logger: clientLogger,
		emitter: {
			postMessage: (message) => window.parent.postMessage(message, targetOrigin),
			addEventListener: (handler) => {
				const listener = (event) => handler(event.data);
				window.addEventListener("message", listener);
				return () => window.removeEventListener("message", listener);
			}
		},
		id: clientId
	}), [
		targetOrigin,
		clientId,
		clientLogger
	]);
	const resetState = React.useCallback(() => {
		setPageDesignerConfig(null);
		setClientPage(null);
		setIsConnected(false);
	}, []);
	React.useEffect(() => {
		clientApi.connect({
			timeout: clientConnectionTimeout,
			interval: clientConnectionInterval,
			onHostConnected: (event) => {
				setPageDesignerConfig(event);
				clientApi.on("ClientConfigurationChanged", (configEvent) => {
					setPageDesignerConfig(configEvent);
				});
				setIsConnected(true);
			},
			onHostDisconnected: (reconnect) => {
				resetState();
				reconnect();
			},
			onError: () => {},
			usid
		});
		return () => {
			clientApi.disconnect();
			resetState();
		};
	}, [
		clientApi,
		clientConnectionTimeout,
		clientConnectionInterval,
		usid,
		resetState
	]);
	const contextValue = React.useMemo(() => ({
		isDesignMode,
		clientApi,
		isConnected,
		pageDesignerConfig,
		pageUpdateMode,
		clientPage,
		setClientPage: (page) => {
			if (pageUpdateMode === "server" && page.id !== clientPageRef.current?.id) {
				clientPageRef.current = page;
				setClientPage(page);
				clientApi?.notifyClientPageChanged({ page });
			}
		}
	}), [
		isDesignMode,
		clientApi,
		isConnected,
		pageDesignerConfig,
		clientPage,
		setClientPage,
		pageUpdateMode
	]);
	return /* @__PURE__ */ jsx(DesignContext.Provider, {
		value: contextValue,
		children: /* @__PURE__ */ jsx(DesignStateProvider, { children: /* @__PURE__ */ jsx(DesignApp, { children }) })
	});
};
DesignProvider.defaultProps = {
	clientLogger: noop,
	clientConnectionTimeout: 6e4,
	clientConnectionInterval: 1e3
};

//#endregion
export { useComponentDiscovery as a, isComponentTypeAllowedInRegion as i, useDesignSelector as n, useThrottledCallback as r, DesignProvider as t };
//# sourceMappingURL=DesignContext.js.map