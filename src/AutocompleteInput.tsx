import { useState } from 'react';

const AutocompleteInput = ({
  options,
  className,
  setInputValue,
  inputValue,
  disabled = false,
  getPrefix,
}: {
  options: string[];
  className?: string;
  setInputValue?: (value: string) => void;
  inputValue: string;
  disabled?: boolean;
  getPrefix?: (value: string) => React.ReactNode;
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleInputChange = (e: { target: { value: string } }) => {
    const value = e.target.value;
    setInputValue?.(value);

    const matchedSuggestions = options.filter((option) =>
      option.toLowerCase().startsWith(value.toLowerCase())
    );

    setSuggestions(value ? matchedSuggestions : []);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue?.(suggestion);
    setSuggestions([]);
  };

  return (
    <div className={`relative ${className || ''}`}>
      <input
        type="text"
        disabled={disabled}
        value={inputValue}
        onChange={handleInputChange}
        className="flex-grow px-2 py-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full disabled:bg-gray-300 disabled:opacity-50"
        placeholder="Nombre de país..."
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 w-full border rounded mt-1 max-h-40 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="bg-white p-2 hover:bg-gray-100 cursor-pointer flex items-center gap-2"
            >
              {getPrefix?.(suggestion)} {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AutocompleteInput;
