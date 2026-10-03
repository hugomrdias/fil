import { useNavigate } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'
import { useState } from 'react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import type { Network } from '@/lib/networks'
import { classifySearch } from '@/lib/search'

/**
 * Explorer search: addresses, PieceCIDs, and ids (data set, rail, provider).
 *
 * @param props.network - Network to search.
 * @param props.defaultValue - Initial query.
 */
export function SearchBox(props: { network: Network; defaultValue?: string }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState(props.defaultValue ?? '')
  const [invalid, setInvalid] = useState(false)

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault()
        const target = classifySearch(query)
        setInvalid(target.type === 'invalid')
        const network = props.network
        switch (target.type) {
          case 'address':
            navigate({
              to: '/$network/address/$address',
              params: { network, address: target.address },
            })
            break
          case 'piece':
            navigate({
              to: '/$network/pieces/$cid',
              params: { network, cid: target.cid },
            })
            break
          case 'id':
            navigate({
              to: '/$network/search',
              params: { network },
              search: { q: target.id },
            })
            break
          default:
            break
        }
      }}
    >
      <InputGroup className="h-10">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          aria-invalid={invalid}
          aria-label="Search"
          onChange={(event) => {
            setQuery(event.target.value)
            setInvalid(false)
          }}
          placeholder="Search by address (0x…), PieceCID, data set, rail or provider id"
          value={query}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="submit" variant="default">
            Search
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {invalid ? (
        <p className="text-xs text-destructive">
          Enter a 0x address, a PieceCID or a numeric id.
        </p>
      ) : null}
    </form>
  )
}
