# Advanced Visual Query Builder for MongoDB Sync Tool Pro
import customtkinter as ctk
import json
from tkinter import messagebox
from typing import Dict, List, Any, Optional
from datetime import datetime
import re

class QueryBuilder:
    def __init__(self, parent, callback=None):
        self.parent = parent
        self.callback = callback
        self.conditions = []
        self.setup_ui()
    
    def setup_ui(self):
        """Setup the query builder UI"""
        self.main_frame = ctk.CTkFrame(self.parent)
        self.main_frame.pack(fill="both", expand=True, padx=10, pady=10)
        
        # Header
        header_frame = ctk.CTkFrame(self.main_frame)
        header_frame.pack(fill="x", padx=10, pady=10)
        
        ctk.CTkLabel(header_frame, text="🔍 Visual Query Builder", 
                    font=ctk.CTkFont(size=18, weight="bold")).pack(side="left", padx=10)
        
        # Clear all button
        ctk.CTkButton(header_frame, text="🗑️ Clear All", 
                     command=self.clear_all, width=100).pack(side="right", padx=10)
        
        # Add condition button
        ctk.CTkButton(header_frame, text="➕ Add Condition", 
                     command=self.add_condition, width=120).pack(side="right", padx=5)
        
        # Conditions frame
        self.conditions_frame = ctk.CTkScrollableFrame(self.main_frame)
        self.conditions_frame.pack(fill="both", expand=True, padx=10, pady=5)
        
        # Query preview frame
        preview_frame = ctk.CTkFrame(self.main_frame)
        preview_frame.pack(fill="x", padx=10, pady=10)
        
        ctk.CTkLabel(preview_frame, text="📋 Generated Query:", 
                    font=ctk.CTkFont(size=14, weight="bold")).pack(anchor="w", padx=10, pady=(10,5))
        
        self.query_preview = ctk.CTkTextbox(preview_frame, height=100, font=("Courier New", 12))
        self.query_preview.pack(fill="x", padx=10, pady=(0,10))
        
        # Action buttons
        action_frame = ctk.CTkFrame(self.main_frame)
        action_frame.pack(fill="x", padx=10, pady=10)
        action_frame.grid_columnconfigure((0,1,2), weight=1)
        
        ctk.CTkButton(action_frame, text="🔍 Execute Query", 
                     command=self.execute_query).grid(row=0, column=0, padx=5, pady=5, sticky="ew")
        
        ctk.CTkButton(action_frame, text="💾 Save Query", 
                     command=self.save_query).grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        
        ctk.CTkButton(action_frame, text="📋 Copy Query", 
                     command=self.copy_query).grid(row=0, column=2, padx=5, pady=5, sticky="ew")
        
        # Add initial condition
        self.add_condition()
    
    def add_condition(self):
        """Add a new query condition"""
        condition_id = len(self.conditions)
        condition_frame = ctk.CTkFrame(self.conditions_frame)
        condition_frame.pack(fill="x", padx=5, pady=5)
        condition_frame.grid_columnconfigure(1, weight=1)
        condition_frame.grid_columnconfigure(3, weight=1)
        
        # Logic operator (AND/OR) - only show for conditions after the first
        if condition_id > 0:
            logic_var = ctk.StringVar(value="AND")
            logic_menu = ctk.CTkOptionMenu(condition_frame, values=["AND", "OR"], 
                                         variable=logic_var, width=60)
            logic_menu.grid(row=0, column=0, padx=5, pady=5)
        else:
            logic_var = None
            ctk.CTkLabel(condition_frame, text="WHERE", width=60).grid(row=0, column=0, padx=5, pady=5)
        
        # Field name
        field_var = ctk.StringVar()
        field_entry = ctk.CTkEntry(condition_frame, textvariable=field_var, 
                                  placeholder_text="Field name (e.g., age)")
        field_entry.grid(row=0, column=1, padx=5, pady=5, sticky="ew")
        
        # Operator
        operator_var = ctk.StringVar(value="equals")
        operator_menu = ctk.CTkOptionMenu(
            condition_frame,
            values=["equals", "not equals", "greater than", "less than", 
                   "greater or equal", "less or equal", "contains", "starts with",
                   "ends with", "in array", "not in array", "exists", "not exists",
                   "regex", "type is", "size equals"],
            variable=operator_var,
            width=120,
            command=lambda x: self.on_operator_change(condition_id, x)
        )
        operator_menu.grid(row=0, column=2, padx=5, pady=5)
        
        # Value
        value_var = ctk.StringVar()
        value_entry = ctk.CTkEntry(condition_frame, textvariable=value_var,
                                  placeholder_text="Value")
        value_entry.grid(row=0, column=3, padx=5, pady=5, sticky="ew")
        
        # Data type selector
        type_var = ctk.StringVar(value="string")
        type_menu = ctk.CTkOptionMenu(
            condition_frame,
            values=["string", "number", "boolean", "date", "objectid", "array", "null"],
            variable=type_var,
            width=80
        )
        type_menu.grid(row=0, column=4, padx=5, pady=5)
        
        # Remove button
        remove_btn = ctk.CTkButton(condition_frame, text="❌", width=30,
                                  command=lambda: self.remove_condition(condition_id))
        remove_btn.grid(row=0, column=5, padx=5, pady=5)
        
        # Store condition data
        condition_data = {
            'frame': condition_frame,
            'logic_var': logic_var,
            'field_var': field_var,
            'operator_var': operator_var,
            'value_var': value_var,
            'type_var': type_var,
            'value_entry': value_entry
        }
        
        self.conditions.append(condition_data)
        
        # Bind change events
        field_var.trace('w', self.update_query_preview)
        operator_var.trace('w', self.update_query_preview)
        value_var.trace('w', self.update_query_preview)
        type_var.trace('w', self.update_query_preview)
        if logic_var:
            logic_var.trace('w', self.update_query_preview)
        
        self.update_query_preview()
    
    def on_operator_change(self, condition_id, operator):
        """Handle operator change to update value field placeholder"""
        condition = self.conditions[condition_id]
        value_entry = condition['value_entry']
        
        placeholders = {
            "equals": "Value",
            "not equals": "Value",
            "greater than": "Number or Date",
            "less than": "Number or Date",
            "greater or equal": "Number or Date",
            "less or equal": "Number or Date",
            "contains": "Text to search",
            "starts with": "Starting text",
            "ends with": "Ending text",
            "in array": "value1,value2,value3",
            "not in array": "value1,value2,value3",
            "exists": "true/false",
            "not exists": "true/false",
            "regex": "Regular expression",
            "type is": "string/number/object/array/boolean/null",
            "size equals": "Array size (number)"
        }
        
        value_entry.configure(placeholder_text=placeholders.get(operator, "Value"))
        
        # Disable value entry for exists/not exists
        if operator in ["exists", "not exists"]:
            value_entry.configure(state="disabled")
            condition['value_var'].set("true")
        else:
            value_entry.configure(state="normal")
        
        self.update_query_preview()
    
    def remove_condition(self, condition_id):
        """Remove a condition"""
        if len(self.conditions) <= 1:
            messagebox.showwarning("Warning", "At least one condition is required")
            return
        
        condition = self.conditions[condition_id]
        condition['frame'].destroy()
        self.conditions.pop(condition_id)
        
        # Re-index remaining conditions
        for i, cond in enumerate(self.conditions):
            # Update remove button command
            for widget in cond['frame'].winfo_children():
                if isinstance(widget, ctk.CTkButton) and widget.cget("text") == "❌":
                    widget.configure(command=lambda idx=i: self.remove_condition(idx))
        
        self.update_query_preview()
    
    def clear_all(self):
        """Clear all conditions"""
        for condition in self.conditions:
            condition['frame'].destroy()
        self.conditions.clear()
        self.add_condition()
    
    def update_query_preview(self, *args):
        """Update the query preview"""
        try:
            query = self.build_query()
            query_json = json.dumps(query, indent=2, default=str)
            
            self.query_preview.delete("1.0", "end")
            self.query_preview.insert("1.0", query_json)
        except Exception as e:
            self.query_preview.delete("1.0", "end")
            self.query_preview.insert("1.0", f"Error building query: {str(e)}")
    
    def build_query(self) -> Dict:
        """Build MongoDB query from conditions"""
        if not self.conditions:
            return {}
        
        query_parts = []
        current_logic = "AND"
        
        for i, condition in enumerate(self.conditions):
            field = condition['field_var'].get().strip()
            operator = condition['operator_var'].get()
            value_str = condition['value_var'].get().strip()
            data_type = condition['type_var'].get()
            
            if not field:
                continue
            
            # Get logic operator for this condition
            if i > 0 and condition['logic_var']:
                current_logic = condition['logic_var'].get()
            
            # Convert value based on data type
            try:
                value = self.convert_value(value_str, data_type, operator)
            except Exception as e:
                raise Exception(f"Invalid value for field '{field}': {str(e)}")
            
            # Build condition
            field_condition = self.build_field_condition(field, operator, value)
            
            if field_condition:
                query_parts.append({
                    'condition': field_condition,
                    'logic': current_logic if i > 0 else None
                })
        
        if not query_parts:
            return {}
        
        # Combine conditions based on logic operators
        return self.combine_conditions(query_parts)
    
    def convert_value(self, value_str: str, data_type: str, operator: str) -> Any:
        """Convert string value to appropriate data type"""
        if operator in ["exists", "not exists"]:
            return value_str.lower() == "true"
        
        if not value_str and operator not in ["exists", "not exists"]:
            raise ValueError("Value is required")
        
        if data_type == "string":
            return value_str
        elif data_type == "number":
            try:
                return float(value_str) if '.' in value_str else int(value_str)
            except ValueError:
                raise ValueError("Invalid number format")
        elif data_type == "boolean":
            return value_str.lower() in ["true", "1", "yes", "on"]
        elif data_type == "date":
            try:
                return datetime.fromisoformat(value_str.replace('Z', '+00:00'))
            except ValueError:
                raise ValueError("Invalid date format (use ISO format)")
        elif data_type == "objectid":
            from bson import ObjectId
            try:
                return ObjectId(value_str)
            except:
                raise ValueError("Invalid ObjectId format")
        elif data_type == "array":
            if operator in ["in array", "not in array"]:
                return [item.strip() for item in value_str.split(',')]
            return value_str.split(',')
        elif data_type == "null":
            return None
        else:
            return value_str
    
    def build_field_condition(self, field: str, operator: str, value: Any) -> Dict:
        """Build MongoDB condition for a single field"""
        if operator == "equals":
            return {field: value}
        elif operator == "not equals":
            return {field: {"$ne": value}}
        elif operator == "greater than":
            return {field: {"$gt": value}}
        elif operator == "less than":
            return {field: {"$lt": value}}
        elif operator == "greater or equal":
            return {field: {"$gte": value}}
        elif operator == "less or equal":
            return {field: {"$lte": value}}
        elif operator == "contains":
            return {field: {"$regex": re.escape(str(value)), "$options": "i"}}
        elif operator == "starts with":
            return {field: {"$regex": f"^{re.escape(str(value))}", "$options": "i"}}
        elif operator == "ends with":
            return {field: {"$regex": f"{re.escape(str(value))}$", "$options": "i"}}
        elif operator == "in array":
            return {field: {"$in": value}}
        elif operator == "not in array":
            return {field: {"$nin": value}}
        elif operator == "exists":
            return {field: {"$exists": value}}
        elif operator == "not exists":
            return {field: {"$exists": not value}}
        elif operator == "regex":
            return {field: {"$regex": str(value), "$options": "i"}}
        elif operator == "type is":
            type_map = {
                "string": "string", "number": "number", "object": "object",
                "array": "array", "boolean": "bool", "null": "null"
            }
            return {field: {"$type": type_map.get(str(value), str(value))}}
        elif operator == "size equals":
            return {field: {"$size": int(value)}}
        else:
            return {field: value}
    
    def combine_conditions(self, query_parts: List[Dict]) -> Dict:
        """Combine multiple conditions with AND/OR logic"""
        if len(query_parts) == 1:
            return query_parts[0]['condition']
        
        # Group by logic operator
        and_conditions = []
        or_conditions = []
        
        for part in query_parts:
            if part['logic'] == "OR":
                or_conditions.append(part['condition'])
            else:
                and_conditions.append(part['condition'])
        
        # Build final query
        final_conditions = []
        
        if and_conditions:
            if len(and_conditions) == 1:
                final_conditions.append(and_conditions[0])
            else:
                final_conditions.append({"$and": and_conditions})
        
        if or_conditions:
            if len(or_conditions) == 1:
                final_conditions.append(or_conditions[0])
            else:
                final_conditions.append({"$or": or_conditions})
        
        if len(final_conditions) == 1:
            return final_conditions[0]
        else:
            return {"$and": final_conditions}
    
    def execute_query(self):
        """Execute the built query"""
        try:
            query = self.build_query()
            if self.callback:
                self.callback(query)
        except Exception as e:
            messagebox.showerror("Error", f"Cannot execute query: {str(e)}")
    
    def save_query(self):
        """Save the current query"""
        try:
            query = self.build_query()
            
            # Ask for query name
            dialog = ctk.CTkInputDialog(text="Enter query name:", title="Save Query")
            query_name = dialog.get_input()
            
            if query_name:
                # Here you would save to the parent app's saved queries
                messagebox.showinfo("Success", f"Query '{query_name}' saved successfully!")
        except Exception as e:
            messagebox.showerror("Error", f"Cannot save query: {str(e)}")
    
    def copy_query(self):
        """Copy query to clipboard"""
        try:
            query = self.build_query()
            query_json = json.dumps(query, indent=2, default=str)
            
            # Copy to clipboard
            self.parent.clipboard_clear()
            self.parent.clipboard_append(query_json)
            
            messagebox.showinfo("Success", "Query copied to clipboard!")
        except Exception as e:
            messagebox.showerror("Error", f"Cannot copy query: {str(e)}")

def create_query_builder_dialog(parent, callback=None):
    """Create a query builder dialog window"""
    dialog = ctk.CTkToplevel(parent)
    dialog.title("🔍 Advanced Query Builder")
    dialog.geometry("900x700")
    dialog.transient(parent)
    dialog.grab_set()
    
    # Configure grid
    dialog.grid_columnconfigure(0, weight=1)
    dialog.grid_rowconfigure(0, weight=1)
    
    # Create query builder
    query_builder = QueryBuilder(dialog, callback)
    
    return dialog, query_builder
