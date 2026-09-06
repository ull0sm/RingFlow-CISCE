# STRICT MANDATE: USE CODE-REVIEW-GRAPH MCP INSTEAD OF WHOLE-REPO SCANS

## 1. Zero-Tolerance Policy on Blind Scans
- **NEVER** run whole-repo recursive file listings (`list_dir` on broad directories) to discover project structure or features.
- **NEVER** run broad `grep_search` across the entire codebase to locate functions, callers, components, or logic when answering questions or reviewing code.
- **NEVER** open and read bulk files (`view_file` on many files consecutively) to trace execution paths or analyze dependencies.

## 2. Mandatory Workflow (Code-Review-Graph First)
For **every** prompt involving architecture, code understanding, debugging, feature exploration, or code review:

1. **Architecture & Subsystems**:
   - Call `mcp: code-review-graph -> get_architecture_overview_tool`
   - Call `mcp: code-review-graph -> list_communities_tool`
2. **Finding Symbols, Features, or Intent**:
   - Call `mcp: code-review-graph -> semantic_search_nodes_tool` (or `query_graph_tool`) to locate relevant nodes and functions.
3. **Tracing Calls & Execution Flow**:
   - Call `mcp: code-review-graph -> list_flows_tool` and `get_flow_tool`.
4. **Analyzing Impact & Dependencies**:
   - Call `mcp: code-review-graph -> get_impact_radius_tool` to see callers and affected nodes.
   - Call `mcp: code-review-graph -> get_affected_flows_tool` to check impacted workflows.
5. **Context Retrieval**:
   - Call `mcp: code-review-graph -> get_minimal_context_tool` or `get_review_context_tool` to get the precise context needed.

## 3. When Filesystem Tools Are Allowed
- You may use `view_file` **ONLY** on the specific, targeted file(s) identified by the graph, and only for targeted line ranges when modifying code or inspecting exact syntax.
- You may use `replace_file_content` / `write_to_file` only after graph impact verification.
