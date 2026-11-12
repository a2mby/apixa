<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Document extends Model
{
    protected $connection = 'pgsql';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['id', 'workspace_id', 'contact_id', 'title', 'disk', 'path', 'original_name', 'mime_type', 'size_bytes', 'sha256', 'fixture_key'];

    protected function casts(): array
    {
        return ['size_bytes' => 'integer'];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function links(): HasMany
    {
        return $this->hasMany(DocumentLink::class);
    }
}
