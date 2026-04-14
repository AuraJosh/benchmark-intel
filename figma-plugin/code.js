figma.showUI(__html__, { width: 320, height: 420 });

figma.ui.onmessage = async msg => {
  if (msg.type === 'sync-data') {
    const data = msg.data;
    let mappedNodes = 0;

    // Safe text helper to prevent font-loading from crashing the plugin
    const setTextSafe = async (node, text) => {
      try {
        if (node.hasMissingFont) return false;
        if (node.fontName === figma.mixed) return false;
        await figma.loadFontAsync(node.fontName);
        node.characters = String(text || "");
        return true;
      } catch (e) {
        console.error("Font load error for", node.name);
        return false;
      }
    };


    // Fetch an image URL and return a Uint8Array — runs in code.js which has network access.
    const fetchImageFromUrl = async (url) => {
      if (!url) return null;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
      } catch (e) {
        console.error("[IMG] Failed to fetch:", url.substring(0, 80), e.message);
        return null;
      }
    };

    // 1. Initial Mapping for non-dynamic layers (IDs, Address, Description, Extras etc.)
    const nodes = figma.currentPage.findAll(n => 
      data.hasOwnProperty(n.name) || 
      n.name === 'imageCover' || 
      n.name === 'imageProposedPlan' || 
      n.name === 'imageAerial'
    );

    for (const node of nodes) {
      try {
        if (node.type === "TEXT") {
          if (node.name.endsWith('Link') && typeof data[node.name] === 'string' && data[node.name].startsWith('http')) {
             // Hero links (Cover, Proposed Plan, etc.)
             let label = "Link to Full Document";
             if (node.name === 'coverLink') label = "View Site Photo / Elevation";
             if (node.name === 'proposedPlanLink') label = "View Proposed Layout";
             if (node.name === 'aerialLink') label = "View Site / Location Plan";
             
             if (await setTextSafe(node, label)) {
               node.hyperlink = { type: 'URL', value: data[node.name] };
               mappedNodes++;
             }
          } else if (data[node.name] !== undefined) {
             if (await setTextSafe(node, data[node.name])) mappedNodes++;
          }
        } 
        else if ((node.type === "RECTANGLE" || node.type === "FRAME" || node.type === "ELLIPSE")) {
          // Fetch image from URL directly in code.js (has network access via manifest)
          const urlKey = `${node.name}`; // e.g. imageCover, imageProposedPlan, imageAerial
          const url = data[urlKey];
          if (url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:'))) {
            try {
              const imageBytes = await fetchImageFromUrl(url);
              if (imageBytes) {
                const newImage = figma.createImage(imageBytes);
                node.fills = [{ type: 'IMAGE', imageHash: newImage.hash, scaleMode: 'FILL' }];
                mappedNodes++;
                console.log("[IMG] Applied image to", node.name);
              }
            } catch(err) {
              console.error("[IMG] Error applying image to", node.name, err.message);
            }
          }
        }
      } catch (err) { console.error("Error mapping node", node.name, err); }
    }

    // 2. Dynamic Floor Summaries inside the Project Summary Section
    try {
      if (data.floors && data.floors.length > 0) {
        const allFloorComps = figma.currentPage.findAll(n => n.name === 'MasterSummaryFloor');
        // Prefer an instance that sits inside a frame (like 'Project Summary') over the naked master template on the board!
        let firstFloorComp = allFloorComps.find(n => n.parent && n.parent.type !== "PAGE");
        if (!firstFloorComp && allFloorComps.length > 0) firstFloorComp = allFloorComps[0];

        if (firstFloorComp) {
          let parent = firstFloorComp.parent;
          // Check if parent is an auto-layout frame safely
          const isAutoLayout = parent && ('layoutMode' in parent) && (parent.layoutMode === "VERTICAL" || parent.layoutMode === "HORIZONTAL");
          const startX = firstFloorComp.x;
          const startY = firstFloorComp.y;
          const floorHeight = firstFloorComp.height + 20; // Default spacing

          for (let i = 0; i < data.floors.length; i++) {
            const floorData = data.floors[i];
            let floorInstance;

            if (i === 0) {
              // Use the existing placeholder for the first item
              floorInstance = firstFloorComp;
            } else {
              try {
                if (firstFloorComp.type === 'COMPONENT') {
                  floorInstance = firstFloorComp.createInstance();
                } else if (firstFloorComp.type === 'INSTANCE') {
                  floorInstance = firstFloorComp.mainComponent.createInstance();
                } else {
                  floorInstance = firstFloorComp.clone();
                }
                // Insert safely into Auto Layout at exact index rather than at bottom of page
              if (parent) {
                const baseIndex = parent.children.indexOf(firstFloorComp);
                parent.insertChild(baseIndex + i, floorInstance);
              }
              
              if (!isAutoLayout) {
                  floorInstance.x = startX;
                  floorInstance.y = startY + (i * floorHeight);
                }
              } catch (e) {
                console.error("Floor clone error", e);
                continue;
              }
            }
            
            const innerNodes = floorInstance.findAll(n => n.name === 'floorLevel' || n.name === 'floorSummary');
            for (const node of innerNodes) {
               if (node.type === "TEXT") {
                  if (node.name === 'floorLevel') await setTextSafe(node, floorData.floorLevel);
                  if (node.name === 'floorSummary') await setTextSafe(node, floorData.floorSummary);
                  mappedNodes++;
               }
            }
          }
        }
      }
    } catch (phase2Err) {
      console.error("Phase 2 crashed", phase2Err);
    }

    // 3. Dynamic Document Pages — positions based on actual rendered height
    try {
      if (data.documentList && data.documentList.length > 0) {
        const masterDoc = figma.currentPage.findOne(n => n.name === 'MasterDocumentPage');
        const masterSuperseded = figma.currentPage.findOne(n => n.name.includes('SupersededPage') || n.name.includes('SuperseededPage'));
        console.log("[PHASE3] masterDoc:", masterDoc ? masterDoc.name : 'NOT FOUND', "| masterSuperseded:", masterSuperseded ? masterSuperseded.name : 'NOT FOUND');
        
        const referenceComp = masterDoc || masterSuperseded;

        if (referenceComp) {
          const GAP = 100; // px gap between document pages
          const startX = referenceComp.x;
          const startY = referenceComp.y;
          let parent = referenceComp.parent;

          // Clean up any PopulatedDocumentPage nodes from previous runs
          // so stale text/images never bleed through
          const staleNodes = figma.currentPage.findAll(n => n.name === 'PopulatedDocumentPage');
          staleNodes.forEach(n => n.remove());
          console.log("[PHASE3] Removed", staleNodes.length, "stale PopulatedDocumentPage nodes");

          // Snapshot nodes to shift BEFORE we start adding new instances.
          const nodesToShift = figma.currentPage.children.filter(n =>
            n.y > referenceComp.y &&
            n.id !== (masterDoc ? masterDoc.id : null) &&
            n.id !== (masterSuperseded ? masterSuperseded.id : null)
          );

          // Start placing docs immediately below the template
          let currentY = startY + referenceComp.height + GAP;

          for (let i = 0; i < data.documentList.length; i++) {
            const docData = data.documentList[i];
            const template = (docData.isSuperseded && masterSuperseded) ? masterSuperseded : masterDoc;
            
            if (!template) continue;
            
            let newInstance;
            try {
              if (template.type === 'COMPONENT') {
                newInstance = template.createInstance();
              } else if (template.type === 'INSTANCE') {
                newInstance = template.mainComponent.createInstance();
              } else {
                newInstance = template.clone();
              }
              if (parent) parent.appendChild(newInstance);
              newInstance.name = "PopulatedDocumentPage";
            } catch(e) {
              console.error("Doc clone error", e);
              continue;
            }
            
            // Position before populating (image resize changes height, not x/y)
            newInstance.x = startX;
            newInstance.y = currentY;

            const innerNodes = newInstance.findAll(n => {
              const cleaned = n.name.trim();
              return cleaned === 'docTitle' || cleaned === 'docLink' || cleaned === 'docPreview';
            });

            for (const node of innerNodes) {
               try {
                 const cleanedName = node.name.trim();
                  if (node.type === "TEXT") {
                   if (cleanedName === 'docTitle' || cleanedName === 'linkText') {
                    const textToSet = docData.linkText || (docData.docTitle ? `Link to ${docData.docTitle}` : 'Link to Document');
                    if (await setTextSafe(node, textToSet)) {
                      if (docData.docLink) node.hyperlink = { type: 'URL', value: docData.docLink };
                      mappedNodes++;
                    }
                   }
                  } else if ((node.type === "RECTANGLE" || node.type === "FRAME" || node.type === "ELLIPSE") && cleanedName === 'docPreview' && docData.docPreview) {
                    try {
                      const imageBytes = await fetchImageFromUrl(docData.docPreview);
                      if (imageBytes) {
                        const newImage = figma.createImage(imageBytes);
                        node.fills = [{ type: 'IMAGE', imageHash: newImage.hash, scaleMode: 'FILL' }];
                        // Keep fixed width; calculate proportional height
                        try {
                          const imgSize = await newImage.getSizeAsync();
                          if (imgSize && imgSize.width > 0 && imgSize.height > 0) {
                            const fixedWidth = node.width;
                            const proportionalHeight = (fixedWidth / imgSize.width) * imgSize.height;
                            node.resize(fixedWidth, proportionalHeight);
                          }
                        } catch (sizeErr) {
                          console.warn("[IMG] getSizeAsync failed, keeping original size:", sizeErr.message);
                        }
                        console.log("[IMG] docPreview applied for:", docData.docTitle);
                        mappedNodes++;
                      } else {
                        console.error("[IMG] docPreview fetch returned null for:", docData.docTitle);
                      }
                    } catch (err) {
                      console.error("[IMG] docPreview FAILED for:", docData.docTitle, err.message);
                    }
                 }
               } catch (e) { console.error("Doc inner mapping error", e); }
            }

            // Advance cursor by this instance's ACTUAL final height (after image resize)
            currentY += newInstance.height + GAP;
          }

          // Now shift pre-existing nodes that were below the reference comp
          // by however much space the new docs actually consumed
          const totalHeightConsumed = currentY - (startY + referenceComp.height + GAP);
          nodesToShift.forEach(n => n.y += totalHeightConsumed + GAP);
        }
      }
    } catch (phase3Err) {
      console.error("Phase 3 crashed", phase3Err);
    }

    figma.ui.postMessage({ type: 'status', message: `Sync complete! Updated ${mappedNodes} layers.` });
  }
};
