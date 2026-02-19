/** @format */

"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, checked, onChange, ...props }, ref) => {
    return (
      <div className="flex items-center">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          checked={checked}
          onChange={onChange}
          className="hidden"
          {...props}
        />
        <div
          className={cn(
            "relative w-4 h-4 rounded cursor-pointer transition-all duration-200",
            "border-2 border-gray-300 hover:border-[#171717] hover:shadow-sm",
            checked ? "bg-[#ccff00] border-[#171717] shadow-md" : "bg-white"
          )}
          style={checked ? { boxShadow: '2px 2px 0px #171717' } : {}}
          onClick={() => onChange?.({ target: { name: props.name, checked: !checked } } as React.ChangeEvent<HTMLInputElement>)}
        >
          {checked && (
            <Check className="w-3 h-3 text-black absolute inset-0 m-auto" />
          )}
        </div>
        {label && (
          <label
            htmlFor={id}
            className={cn("ml-3 text-sm text-gray-700 cursor-pointer", className)}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
