import { useState } from 'react';

const AutocompleteInput = ({
  options,
  className,
  setInputValue,
  inputValue,
}: {
  options: string[];
  className?: string;
  setInputValue?: (value: string) => void;
  inputValue: string;
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleInputChange = (e) => {
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
        value={inputValue}
        onChange={handleInputChange}
        className="flex-grow px-2 py-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
        placeholder="Start typing..."
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 w-full border rounded mt-1 max-h-40 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <li
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="bg-white p-2 hover:bg-gray-100 cursor-pointer"
            >
              {suggestion}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AutocompleteInput;
