/** @format */

import React, { forwardRef, memo } from "react";

interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

// Arrow function component
export const Button = ({
  label,
  onClick,
  variant = "primary",
}: ButtonProps) => {
  return (
    <button className={`btn btn-${variant}`} onClick={onClick}>
      {label}
    </button>
  );
};

// forwardRef component
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  (props, ref) => {
    return (
      <button ref={ref} onClick={props.onClick}>
        {props.label}
      </button>
    );
  }
);

// memo wrapped component
export const MemoizedButton = memo(({ label, onClick }: ButtonProps) => {
  return <button onClick={onClick}>{label}</button>;
});

// Custom hook
export function useButtonState(initialState: boolean) {
  const [isPressed, setIsPressed] = React.useState(initialState);

  const toggle = () => setIsPressed(!isPressed);

  return { isPressed, toggle };
}

// Default export
export default Button;
